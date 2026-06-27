import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  CreateDeviceDto,
  UpdateDeviceDto,
  DeviceQueryDto,
} from './dto/device.dto';
import { Status } from '../../generated/prisma';

@Injectable()
export class DeviceService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  // ─── PRIVATE: GET DESCENDANT CATEGORY IDS ────────────────
  private async getDescendantCategoryIds(
    categoryId: string,
  ): Promise<string[]> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { subCategories: true },
    });
    if (!category) return [];

    let ids = [category.id];
    for (const sub of category.subCategories) {
      const subIds = await this.getDescendantCategoryIds(sub.id);
      ids = ids.concat(subIds);
    }
    return ids;
  }

  // ─── FIND ALL ─────────────────────────────────────────────

  async findAll(query: DeviceQueryDto) {
    const { page, limit, search, categoryId, status, minPrice, maxPrice } =
      query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (categoryId) {
      const categoryIds = await this.getDescendantCategoryIds(categoryId);
      where.categoryId = { in: categoryIds };
    }
    if (status) where.status = status;

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, devices] = await Promise.all([
      this.prisma.device.count({ where }),
      this.prisma.device.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
          images: { orderBy: { order: 'asc' } },
          variants: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: devices,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── FIND ONE ─────────────────────────────────────────────

  async findOne(id: string) {
    const device = await this.prisma.device.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { order: 'asc' } },
        variants: true,
        logs: { orderBy: { performedAt: 'desc' } },
        reviews: {
          where: { status: 'APPROVED' },
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }

    return device;
  }

  // ─── CREATE ───────────────────────────────────────────────

  async create(dto: CreateDeviceDto) {
    console.log('DTO =', dto);
    console.log('Variants =', dto.variants);
    console.log('First Variant =', dto.variants?.[0]);
    console.log('First Variant Name =', dto.variants?.[0]?.name);
    // Category check
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Category with ID ${dto.categoryId} not found`,
      );
    }

    // Serial number uniqueness
    const existing = await this.prisma.device.findUnique({
      where: { serialNumber: dto.serialNumber },
    });
    if (existing) {
      throw new BadRequestException(
        `Device with serial number ${dto.serialNumber} already exists`,
      );
    }

    const { images, variants, imageUrl, ...deviceFields } = dto;

    const device = await this.prisma.$transaction(async (tx) => {
      // 1. Device create
      const created = await tx.device.create({
        data: {
          ...deviceFields,
          purchaseDate: new Date(dto.purchaseDate),
          warrantyExpiry: new Date(dto.warrantyExpiry),
        },
      });

      // 2. Primary image (Cloudinary upload থেকে আসা) + extra images
      const allImages: { url: string; isPrimary: boolean; order: number }[] =
        [];

      if (imageUrl) {
        allImages.push({ url: imageUrl, isPrimary: true, order: 0 });
      }

      if (images && images.length > 0) {
        images.forEach((img, idx) => {
          // imageUrl থেকে primary set হয়ে গেলে বাকিগুলো non-primary
          const isPrimary = img.isPrimary ?? (!imageUrl && idx === 0);
          allImages.push({
            url: img.url,
            isPrimary: imageUrl ? false : isPrimary,
            order: img.order ?? idx + (imageUrl ? 1 : 0),
          });
        });
      }

      if (allImages.length > 0) {
        await tx.deviceImage.createMany({
          data: allImages.map((img) => ({ ...img, deviceId: created.id })),
        });
      }

      // 3. Variants
      if (variants && variants.length > 0) {
        for (const v of variants) {
          await tx.deviceVariant.create({
            data: {
              deviceId: created.id,
              name: v.name,
              sku: v.sku,
              price: v.price ?? null,
              stock: v.stock ?? 0,
              specifications: v.specifications ?? {},
              imageUrl: v.imageUrl,
              isActive: v.isActive ?? true,
            },
          });
        }
      }

      // 4. Inventory log
      await tx.inventoryLog.create({
        data: {
          deviceId: created.id,
          action: 'CREATE',
          remarks: `Device initialized. Status: ${created.status}. Variants: ${variants?.length ?? 0}. Images: ${allImages.length}.`,
        },
      });

      return created;
    });

    await this.notificationService.notifyAdminsAndStaff({
      message: `New device added: ${device.name} (${device.brand} ${device.model})`,
      type: 'INFO',
    });

    // Full device return with relations
    return this.findOne(device.id);
  }

  // ─── UPDATE ───────────────────────────────────────────────

  async update(id: string, dto: UpdateDeviceDto) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Category with ID ${dto.categoryId} not found`,
        );
      }
    }

    if (dto.serialNumber && dto.serialNumber !== device.serialNumber) {
      const existing = await this.prisma.device.findUnique({
        where: { serialNumber: dto.serialNumber },
      });
      if (existing) {
        throw new BadRequestException(
          `Device with serial number ${dto.serialNumber} already exists`,
        );
      }
    }

    const { variants, newImages, deleteImageIds, imageUrl, ...updateFields } =
      dto;

    const updateData: any = { ...updateFields };
    if (dto.purchaseDate) updateData.purchaseDate = new Date(dto.purchaseDate);
    if (dto.warrantyExpiry)
      updateData.warrantyExpiry = new Date(dto.warrantyExpiry);

    // Status change track
    const statusChanged = dto.status && dto.status !== device.status;
    const oldStatus = device.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Core device update
      const result = await tx.device.update({
        where: { id },
        data: updateData,
      });

      // 2. Primary image update (নতুন Cloudinary upload)
      if (imageUrl) {
        // আগের primary unset করো
        await tx.deviceImage.updateMany({
          where: { deviceId: id, isPrimary: true },
          data: { isPrimary: false },
        });

        // নতুন primary add
        const maxOrder = await tx.deviceImage.aggregate({
          where: { deviceId: id },
          _max: { order: true },
        });
        await tx.deviceImage.create({
          data: {
            deviceId: id,
            url: imageUrl,
            isPrimary: true,
            order: (maxOrder._max.order ?? -1) + 1,
          },
        });
      }

      // 3. Delete specific images
      if (deleteImageIds && deleteImageIds.length > 0) {
        await tx.deviceImage.deleteMany({
          where: { id: { in: deleteImageIds }, deviceId: id },
        });
      }

      // 4. নতুন additional images
      if (newImages && newImages.length > 0) {
        const maxOrder = await tx.deviceImage.aggregate({
          where: { deviceId: id },
          _max: { order: true },
        });
        let nextOrder = (maxOrder._max.order ?? -1) + 1;

        await tx.deviceImage.createMany({
          data: newImages.map((img) => ({
            deviceId: id,
            url: img.url,
            isPrimary: img.isPrimary ?? false,
            order: img.order ?? nextOrder++,
          })),
        });
      }

      // 5. Variants upsert
      if (variants && variants.length > 0) {
        for (const v of variants) {
          if (v.id) {
            // Existing variant update
            await tx.deviceVariant.update({
              where: { id: v.id },
              data: {
                name: v.name,
                sku: v.sku,
                price: v.price !== undefined ? v.price : undefined,
                stock: v.stock,
                specifications: v.specifications,
                imageUrl: v.imageUrl,
                isActive: v.isActive,
              },
            });
          } else {
            // নতুন variant create
            await tx.deviceVariant.create({
              data: {
                deviceId: id,
                name: v.name!,
                sku: v.sku,
                price: v.price !== undefined ? v.price : null,
                stock: v.stock ?? 0,
                specifications: v.specifications,
                imageUrl: v.imageUrl,
                isActive: v.isActive ?? true,
              },
            });
          }
        }
      }

      // 6. Audit log
      const changes: string[] = [];
      let action = 'UPDATE';

      if (statusChanged) {
        changes.push(`Status: ${oldStatus} → ${dto.status}`);
        action = 'STATUS_CHANGE';
      }
      if (dto.name && dto.name !== device.name) changes.push(`Name updated`);
      if (dto.price !== undefined && Number(dto.price) !== Number(device.price))
        changes.push(`Price updated`);
      if (dto.categoryId && dto.categoryId !== device.categoryId)
        changes.push(`Category updated`);
      if (imageUrl) changes.push(`Primary image updated`);
      if (newImages?.length) changes.push(`${newImages.length} image(s) added`);
      if (deleteImageIds?.length)
        changes.push(`${deleteImageIds.length} image(s) removed`);
      if (variants?.length) changes.push(`Variants updated`);

      const remarks =
        changes.length > 0
          ? `Device modified: ${changes.join(', ')}`
          : 'Device details updated.';

      await tx.inventoryLog.create({
        data: { deviceId: id, action, remarks },
      });

      return result;
    });

    // ─── Notifications ─────────────────────────────────────

    if (statusChanged) {
      await this.handleStatusChangeNotification(
        updated.id,
        device.name,
        oldStatus,
        dto.status!,
      );
    }

    return this.findOne(id);
  }

  // ─── REMOVE ───────────────────────────────────────────────

  async remove(id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryLog.deleteMany({ where: { deviceId: id } });
      await tx.deviceImage.deleteMany({ where: { deviceId: id } });
      await tx.device.delete({ where: { id } });
    });

    return {
      message: 'Device deleted successfully',
      id,
    };
  }

  // ─── PRIVATE: Status Change Notification ──────────────────

  private async handleStatusChangeNotification(
    deviceId: string,
    deviceName: string,
    oldStatus: Status,
    newStatus: Status,
  ) {
    // Device যারা borrow করেছে / pending request আছে তাদের notify
    if (newStatus === Status.RETIRED || newStatus === Status.IN_MAINTENANCE) {
      const affectedRequests = await this.prisma.borrowRequest.findMany({
        where: {
          deviceId,
          status: { in: ['PENDING', 'APPROVED'] },
        },
        select: { userId: true },
        distinct: ['userId'],
      });

      const type = newStatus === Status.RETIRED ? 'WARNING' : 'INFO';
      const message =
        newStatus === Status.RETIRED
          ? `Device "${deviceName}" has been retired and is no longer available.`
          : `Device "${deviceName}" is currently under maintenance and temporarily unavailable.`;

      for (const req of affectedRequests) {
        await this.notificationService.createNotification({
          userId: req.userId,
          message,
          type,
        });
      }
    }

    if (newStatus === Status.AVAILABLE && oldStatus !== Status.AVAILABLE) {
      await this.notificationService.notifyAdminsAndStaff({
        message: `Device "${deviceName}" is now available again (was ${oldStatus}).`,
        type: 'SUCCESS',
      });
    }
  }
}
