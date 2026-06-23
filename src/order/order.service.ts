import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, OrderQueryDto, UpdateOrderDto } from './dto/order.dto';

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: OrderQueryDto) {
    const { page, limit, userId, status, paymentStatus } = query;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
          items: { include: { device: true } },
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        items: { include: { device: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  async create(dto: CreateOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    const deviceIds = [...new Set(dto.items.map((item) => item.deviceId))];
    const devices = await this.prisma.device.findMany({
      where: { id: { in: deviceIds } },
    });
    const deviceMap = new Map(devices.map((device) => [device.id, device]));

    for (const deviceId of deviceIds) {
      if (!deviceMap.has(deviceId)) {
        throw new NotFoundException(`Device with ID ${deviceId} not found`);
      }
    }

    const items = dto.items.map((item) => {
      const device = deviceMap.get(item.deviceId)!;
      const unitPrice = item.unitPrice ?? Number(device.price);
      const total = unitPrice * item.quantity;

      return {
        deviceId: item.deviceId,
        quantity: item.quantity,
        unitPrice,
        total,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = dto.discount ?? 0;
    const tax = dto.tax ?? 0;
    const total = subtotal - discount + tax;

    if (total < 0) {
      throw new BadRequestException('Order total cannot be negative');
    }

    const orderNumber = await this.generateOrderNumber();

    return this.prisma.order.create({
      data: {
        orderNumber,
        userId: dto.userId,
        subtotal,
        discount,
        tax,
        total,
        notes: dto.notes,
        items: {
          create: items,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        items: { include: { device: true } },
        payments: true,
      },
    });
  }

  async update(id: string, dto: UpdateOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const subtotal = Number(order.subtotal);
    const discount = dto.discount ?? Number(order.discount);
    const tax = dto.tax ?? Number(order.tax);
    const total = subtotal - discount + tax;

    if (total < 0) {
      throw new BadRequestException('Order total cannot be negative');
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        paymentStatus: dto.paymentStatus,
        discount: dto.discount,
        tax: dto.tax,
        total,
        notes: dto.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        items: { include: { device: true } },
        payments: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const deleted = await this.prisma.order.delete({
      where: { id },
    });

    return {
      message: 'Order deleted successfully',
      id: deleted.id,
    };
  }

  private async generateOrderNumber() {
    const date = new Date();
    const prefix = `ORD-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const count = await this.prisma.order.count({
      where: {
        orderNumber: {
          startsWith: prefix,
        },
      },
    });

    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }
}
