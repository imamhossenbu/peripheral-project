// borrow-request.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBorrowRequestDto,
  ReviewBorrowRequestDto,
  BorrowRequestQueryDto,
} from './dto/borrow-request.dto';
import { BorrowStatus } from '../../generated/prisma';
import { FineService } from '../fine/fine.service';

@Injectable()
export class BorrowRequestService {
  constructor(
    private prisma: PrismaService,
    private fineService: FineService,
  ) {}

  // Student: নিজের সব request দেখবে
  async getMyRequests(userId: string, query: BorrowRequestQueryDto) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) where.status = status;

    const [total, requests] = await Promise.all([
      this.prisma.borrowRequest.count({ where }),
      this.prisma.borrowRequest.findMany({
        where,
        skip,
        take: limit,
        include: { device: { include: { category: true } }, variant: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: requests,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Admin: সব request দেখবে, filter করতে পারবে
  async getAllRequests(query: BorrowRequestQueryDto) {
    const { page, limit, status, userId, deviceId } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (deviceId) where.deviceId = deviceId;

    const [total, requests] = await Promise.all([
      this.prisma.borrowRequest.count({ where }),
      this.prisma.borrowRequest.findMany({
        where,
        skip,
        take: limit,
        include: {
          device: { include: { category: true } },
          variant: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: requests,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Student: নতুন borrow request তৈরি করবে
  async create(userId: string, dto: CreateBorrowRequestDto) {
    // Date validation
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (start >= end) {
      throw new BadRequestException('End date must be after start date');
    }
    if (start < new Date()) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    // Device exist করে কিনা check
    const device = await this.prisma.device.findUnique({
      where: { id: dto.deviceId },
    });
    if (!device) {
      throw new NotFoundException(`Device with ID ${dto.deviceId} not found`);
    }

    // Variant দেওয়া থাকলে exist করে কিনা ও stock check
    if (dto.variantId) {
      const variant = await this.prisma.deviceVariant.findUnique({
        where: { id: dto.variantId },
      });
      if (!variant) {
        throw new NotFoundException(
          `Variant with ID ${dto.variantId} not found`,
        );
      }
      if (variant.deviceId !== dto.deviceId) {
        throw new BadRequestException(
          'Variant does not belong to the specified device',
        );
      }
      if (variant.stock <= 0) {
        throw new BadRequestException(
          `Variant "${variant.name}" is currently out of stock`,
        );
      }
    }
    // NOTE: no variantId provided -> stock not enforced (Device has no stock field)

    // Date-overlap check against DeviceBooking for this device/variant
    const overlapping = await this.prisma.deviceBooking.findFirst({
      where: {
        deviceId: dto.deviceId,
        startDate: { lt: end },
        endDate: { gt: start },
        OR: [
          { variantId: null }, // device-level booking blocks all variants
          ...(dto.variantId ? [{ variantId: dto.variantId }] : []),
        ],
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        `Device "${device.name}" is already booked for an overlapping period`,
      );
    }

    // Request create + admin কে notification
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.borrowRequest.create({
        data: {
          userId,
          deviceId: dto.deviceId,
          variantId: dto.variantId,
          startDate: start,
          endDate: end,
          reason: dto.reason,
          status: BorrowStatus.PENDING,
        },
        include: {
          device: true,
          variant: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      // Admin দের notification পাঠাও
      const admins = await tx.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      });

      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            message: `New borrow request for "${device.name}" from ${request.user.firstName} ${request.user.lastName}. Reason: ${dto.reason}`,
            type: 'BORROW_REQUEST',
          })),
        });
      }

      return request;
    });
  }

  // Admin: approve বা reject করবে
  async review(
    adminId: string,
    requestId: string,
    dto: ReviewBorrowRequestDto,
  ) {
    const request = await this.prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: { device: true, variant: true, user: true },
    });

    if (!request) {
      throw new NotFoundException(
        `Borrow request with ID ${requestId} not found`,
      );
    }

    if (request.status !== BorrowStatus.PENDING) {
      throw new BadRequestException(
        `Request is already ${request.status.toLowerCase()}, cannot review again`,
      );
    }

    if (
      dto.status !== BorrowStatus.APPROVED &&
      dto.status !== BorrowStatus.REJECTED
    ) {
      throw new BadRequestException('Status must be APPROVED or REJECTED');
    }

    return this.prisma.$transaction(async (tx) => {
      // Status update
      const updated = await tx.borrowRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status,
          adminNote: dto.adminNote,
        },
      });

      if (dto.status === BorrowStatus.APPROVED) {
        // Re-check overlap at approval time too (another request could've been
        // approved for an overlapping window between create() and now)
        const overlapping = await tx.deviceBooking.findFirst({
          where: {
            deviceId: request.deviceId,
            startDate: { lt: request.endDate },
            endDate: { gt: request.startDate },
            OR: [
              { variantId: null },
              ...(request.variantId ? [{ variantId: request.variantId }] : []),
            ],
          },
        });
        if (overlapping) {
          throw new BadRequestException(
            `Cannot approve: "${request.device.name}" is already booked for an overlapping period`,
          );
        }

        // Variant stock কমাও (যদি variant দেওয়া থাকে)
        if (request.variantId) {
          const variant = await tx.deviceVariant.findUnique({
            where: { id: request.variantId },
          });
          if (!variant || variant.stock <= 0) {
            throw new BadRequestException(
              `Cannot approve: "${request.device.name}" variant is now out of stock`,
            );
          }
          await tx.deviceVariant.update({
            where: { id: request.variantId },
            data: { stock: { decrement: 1 } },
          });
        }

        // Booking calendar এ entry করো
        await tx.deviceBooking.create({
          data: {
            deviceId: request.deviceId,
            variantId: request.variantId,
            userId: request.userId,
            startDate: request.startDate,
            endDate: request.endDate,
            note: `Borrow request ${request.id}`,
          },
        });

        // Inventory log
        await tx.inventoryLog.create({
          data: {
            deviceId: request.deviceId,
            action: 'BORROW',
            remarks: `Borrowed by user ${request.user.firstName} ${request.user.lastName} (${request.userId}). Return expected: ${request.endDate.toDateString()}.`,
          },
        });
      }

      // Student কে notification পাঠাও
      const notifType =
        dto.status === BorrowStatus.APPROVED
          ? 'BORROW_APPROVED'
          : 'BORROW_REJECTED';
      const statusText =
        dto.status === BorrowStatus.APPROVED ? 'approved' : 'rejected';
      const noteText = dto.adminNote ? ` Admin note: ${dto.adminNote}` : '';

      await tx.notification.create({
        data: {
          userId: request.userId,
          message: `Your borrow request for "${request.device.name}" has been ${statusText}.${noteText}`,
          type: notifType,
        },
      });

      return updated;
    });
  }

  // Student: device return করবে
  async returnDevice(userId: string, requestId: string) {
    const request = await this.prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: { device: true, variant: true },
    });

    if (!request) {
      throw new NotFoundException(
        `Borrow request with ID ${requestId} not found`,
      );
    }

    if (request.userId !== userId) {
      throw new ForbiddenException('This is not your borrow request');
    }

    if (request.status !== BorrowStatus.APPROVED) {
      throw new BadRequestException('Only approved requests can be returned');
    }

    return this.prisma.$transaction(async (tx) => {
      const returnedAt = new Date();

      // Status RETURNED করো + returnedAt set করো
      const updated = await tx.borrowRequest.update({
        where: { id: requestId },
        data: { status: BorrowStatus.RETURNED, returnedAt },
      });

      // endDate পার হয়ে গেলে automatically late fine create করো
      await this.fineService.createLateFineIfApplicable(tx, {
        borrowRequestId: requestId,
        userId: request.userId,
        endDate: request.endDate,
        returnedAt,
      });

      // Variant stock বাড়াও (যদি variant দেওয়া থাকে)
      if (request.variantId) {
        await tx.deviceVariant.update({
          where: { id: request.variantId },
          data: { stock: { increment: 1 } },
        });
      }

      // Inventory log
      await tx.inventoryLog.create({
        data: {
          deviceId: request.deviceId,
          action: 'RETURN',
          remarks: `Device returned by user ${userId}. Request ID: ${requestId}.`,
        },
      });

      // Admin দের notification
      const admins = await tx.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      });

      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            message: `Device "${request.device.name}" has been returned. Stock updated.`,
            type: 'BORROW_RETURNED',
          })),
        });
      }

      // ব্যবহারকারীকেও confirmation notification
      await tx.notification.create({
        data: {
          userId: request.userId,
          message: `You have successfully returned "${request.device.name}".`,
          type: 'BORROW_RETURNED',
        },
      });

      return { message: 'Device returned successfully', data: updated };
    });
  }
}
