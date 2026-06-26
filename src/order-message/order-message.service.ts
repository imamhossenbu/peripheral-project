import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrderMessageService {
  constructor(private prisma: PrismaService) {}

  async sendMessage(params: {
    orderId: string;
    senderId: string;
    message: string;
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${params.orderId} not found`);
    }

    return this.prisma.orderMessage.create({
      data: {
        orderId: params.orderId,
        senderId: params.senderId,
        message: params.message,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });
  }

  // Order er shob message — page load e history dekhanor jonno
  async getHistory(orderId: string, limit?: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const messages = await this.prisma.orderMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      take: limit ?? 200,
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });

    return messages;
  }
}
