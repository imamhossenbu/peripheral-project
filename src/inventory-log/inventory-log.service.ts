import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateManualLogDto, LogQueryDto } from './dto/inventory-log.dto';

@Injectable()
export class InventoryLogService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: LogQueryDto) {
    const { page, limit, deviceId, action, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (deviceId) {
      where.deviceId = deviceId;
    }

    if (action) {
      where.action = action;
    }

    if (startDate || endDate) {
      where.performedAt = {};
      if (startDate) {
        where.performedAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.performedAt.lte = new Date(endDate);
      }
    }

    const [total, logs] = await this.prisma.$transaction([
      this.prisma.inventoryLog.count({ where }),
      this.prisma.inventoryLog.findMany({
        where,
        skip,
        take: limit,
        include: {
          device: {
            select: {
              id: true,
              name: true,
              brand: true,
              model: true,
              serialNumber: true,
            },
          },
        },
        orderBy: { performedAt: 'desc' },
      }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createManualLog(dto: CreateManualLogDto) {
    const device = await this.prisma.device.findUnique({
      where: { id: dto.deviceId },
    });
    if (!device) {
      throw new NotFoundException(`Device with ID ${dto.deviceId} not found`);
    }

    return this.prisma.inventoryLog.create({
      data: {
        deviceId: dto.deviceId,
        action: dto.action.toUpperCase(),
        remarks: dto.remarks ?? 'Manual log entry',
      },
    });
  }
}
