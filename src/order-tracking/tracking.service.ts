import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderTrackingStage } from '../../generated/prisma';

@Injectable()
export class OrderTrackingService {
  constructor(private prisma: PrismaService) {}

  async recordLocation(params: {
    orderId: string;
    staffId: string;
    latitude: number;
    longitude: number;
    stage?: OrderTrackingStage;
    note?: string;
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${params.orderId} not found`);
    }

    return this.prisma.orderTracking.create({
      data: {
        orderId: params.orderId,
        staffId: params.staffId,
        latitude: params.latitude,
        longitude: params.longitude,
        stage: params.stage ?? OrderTrackingStage.OUT_FOR_DELIVERY,
        note: params.note,
      },
    });
  }

  // Order er shob tracking point (history) — map e path draw korar jonno
  async getHistory(orderId: string, limit?: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    return this.prisma.orderTracking.findMany({
      where: { orderId },
      orderBy: { recordedAt: 'desc' },
      take: limit ?? 100,
      include: {
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // Latest point-i current location
  async getCurrentLocation(orderId: string) {
    const latest = await this.prisma.orderTracking.findFirst({
      where: { orderId },
      orderBy: { recordedAt: 'desc' },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return latest; // null hote pare jodi kono update ekhono na hoy
  }

  // Order ti ei userId er ki na check (student-er nijer order kina, ownership)
  async verifyOwnership(orderId: string, userId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    return Boolean(order && order.userId === userId);
  }
}
