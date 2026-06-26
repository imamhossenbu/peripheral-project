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

@Injectable()
export class BorrowRequestService {
  constructor(private prisma: PrismaService) {}

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
        include: { device: { include: { category: true } } },
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
          user: { select: { id: true, name: true, email: true } },
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

    // Stock আছে কিনা check
    if (device.stock <= 0) {
      throw new BadRequestException(
        `Device "${device.name}" is currently out of stock`,
      );
    }

    // Same device এ same user এর pending/approved request আছে কিনা
    const conflicting = await this.prisma.borrowRequest.findFirst({
      where: {
        userId,
        deviceId: dto.deviceId,
        status: { in: [BorrowStatus.PENDING, BorrowStatus.APPROVED] },
      },
    });
    if (conflicting) {
      throw new BadRequestException(
        'You already have an active or pending request for this device',
      );
    }

    // Request create + admin কে notification
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.borrowRequest.create({
        data: {
          userId,
          deviceId: dto.deviceId,
          startDate: start,
          endDate: end,
          reason: dto.reason,
          status: BorrowStatus.PENDING,
        },
        include: {
          device: true,
          user: { select: { id: true, name: true, email: true } },
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
            message: `New borrow request for "${device.name}" from ${request.user.name}. Reason: ${dto.reason}`,
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
      include: { device: true, user: true },
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
        // Stock কমাও
        if (request.device.stock <= 0) {
          throw new BadRequestException(
            `Cannot approve: "${request.device.name}" is now out of stock`,
          );
        }

        await tx.device.update({
          where: { id: request.deviceId },
          data: { stock: { decrement: 1 } },
        });

        // Inventory log
        await tx.inventoryLog.create({
          data: {
            deviceId: request.deviceId,
            action: 'BORROW',
            remarks: `Borrowed by user ${request.user.name} (${request.userId}). Return expected: ${request.endDate.toDateString()}.`,
          },
        });
      }

      // Student কে notification পাঠাও
      const statusText =
        dto.status === BorrowStatus.APPROVED ? 'approved' : 'rejected';
      const noteText = dto.adminNote ? ` Admin note: ${dto.adminNote}` : '';

      await tx.notification.create({
        data: {
          userId: request.userId,
          message: `Your borrow request for "${request.device.name}" has been ${statusText}.${noteText}`,
          type: 'BORROW_REVIEW',
        },
      });

      return updated;
    });
  }

  // Student: device return করবে
  async returnDevice(userId: string, requestId: string) {
    const request = await this.prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: { device: true },
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
      // Status RETURNED করো
      const updated = await tx.borrowRequest.update({
        where: { id: requestId },
        data: { status: BorrowStatus.RETURNED },
      });

      // Stock বাড়াও
      await tx.device.update({
        where: { id: request.deviceId },
        data: { stock: { increment: 1 } },
      });

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
            type: 'DEVICE_RETURNED',
          })),
        });
      }

      return { message: 'Device returned successfully', data: updated };
    });
  }
}
