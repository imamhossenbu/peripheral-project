import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeviceDto, UpdateDeviceDto, DeviceQueryDto } from './dto/device.dto';

@Injectable()
export class DeviceService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: DeviceQueryDto) {
    const { page, limit, search, categoryId, status, minPrice, maxPrice } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (status) {
      where.status = status;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) {
        where.price.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.price.lte = maxPrice;
      }
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
        include: { category: true },
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

  async findOne(id: string) {
    const device = await this.prisma.device.findUnique({
      where: { id },
      include: {
        category: true,
        logs: {
          orderBy: { performedAt: 'desc' },
        },
      },
    });

    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }

    return device;
  }

  async create(dto: CreateDeviceDto) {
    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${dto.categoryId} not found`);
    }

    // Verify serial number is unique
    const existing = await this.prisma.device.findUnique({
      where: { serialNumber: dto.serialNumber },
    });
    if (existing) {
      throw new BadRequestException(`Device with serial number ${dto.serialNumber} already exists`);
    }

    // Create device and log transaction
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: {
          ...dto,
          purchaseDate: new Date(dto.purchaseDate),
          warrantyExpiry: new Date(dto.warrantyExpiry),
        },
      });

      // Create inventory log
      await tx.inventoryLog.create({
        data: {
          deviceId: device.id,
          action: 'CREATE',
          remarks: `Device initialized in inventory. Status set to ${device.status}.`,
        },
      });

      return device;
    });
  }

  async update(id: string, dto: UpdateDeviceDto) {
    const device = await this.prisma.device.findUnique({
      where: { id },
    });
    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }

    // Verify category exists if provided
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Category with ID ${dto.categoryId} not found`);
      }
    }

    // Verify serial number is unique if provided
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

    const updateData: any = { ...dto };
    if (dto.purchaseDate) updateData.purchaseDate = new Date(dto.purchaseDate);
    if (dto.warrantyExpiry) updateData.warrantyExpiry = new Date(dto.warrantyExpiry);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.device.update({
        where: { id },
        data: updateData,
      });

      // Formulate audit log remarks
      const changes: string[] = [];
      let action = 'UPDATE';

      if (dto.status && dto.status !== device.status) {
        changes.push(`Status changed from ${device.status} to ${dto.status}`);
        action = 'STATUS_CHANGE';
      }

      // Track other key changes
      if (dto.name && dto.name !== device.name) changes.push(`Name updated`);
      if (dto.price && Number(dto.price) !== Number(device.price)) changes.push(`Price updated`);
      if (dto.categoryId && dto.categoryId !== device.categoryId) changes.push(`Category updated`);

      const remarks = changes.length > 0 
        ? `Device details modified: ${changes.join(', ')}` 
        : 'Device details updated without structural changes.';

      await tx.inventoryLog.create({
        data: {
          deviceId: id,
          action,
          remarks,
        },
      });

      return updated;
    });
  }

  async remove(id: string) {
    const device = await this.prisma.device.findUnique({
      where: { id },
    });
    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Delete referencing logs first
      await tx.inventoryLog.deleteMany({
        where: { deviceId: id },
      });

      // Delete device
      const deleted = await tx.device.delete({
        where: { id },
      });

      return {
        message: 'Device and its logs deleted successfully',
        id: deleted.id,
      };
    });
  }
}
