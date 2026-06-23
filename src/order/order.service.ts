import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
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

  async generateInvoicePdf(id: string): Promise<Buffer> {
    const order = await this.findOne(id);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const paidAmount = order.payments
        .filter((payment) => payment.status === 'SUCCESS')
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      const balanceDue = Math.max(Number(order.total) - paidAmount, 0);
      const customerName = [order.user.firstName, order.user.lastName]
        .filter(Boolean)
        .join(' ') || order.user.email;

      doc.fontSize(22).text('Periphex Invoice', { align: 'right' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Invoice: ${order.orderNumber}`, { align: 'right' });
      doc.text(`Created: ${order.createdAt.toLocaleDateString()}`, { align: 'right' });
      doc.moveDown(2);

      doc.fontSize(12).text('Bill To', { underline: true });
      doc.fontSize(10).text(customerName);
      doc.text(order.user.email);
      if (order.user.department) doc.text(`Department: ${order.user.department}`);
      doc.moveDown(1.5);

      doc.fontSize(12).text('Order Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9);
      doc.text('Item', 50, doc.y, { width: 210, continued: true });
      doc.text('Qty', 260, doc.y, { width: 45, align: 'right', continued: true });
      doc.text('Unit', 320, doc.y, { width: 80, align: 'right', continued: true });
      doc.text('Total', 425, doc.y, { width: 90, align: 'right' });
      doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).stroke();
      doc.moveDown(0.7);

      for (const item of order.items) {
        const y = doc.y;
        const itemName = `${item.device.name} (${item.device.brand} ${item.device.model})`;
        doc.text(itemName, 50, y, { width: 210 });
        doc.text(String(item.quantity), 260, y, { width: 45, align: 'right' });
        doc.text(`USD ${Number(item.unitPrice).toFixed(2)}`, 320, y, { width: 80, align: 'right' });
        doc.text(`USD ${Number(item.total).toFixed(2)}`, 425, y, { width: 90, align: 'right' });
        doc.moveDown(0.9);
      }

      doc.moveDown(1);
      const totalsX = 360;
      doc.fontSize(10);
      doc.text('Subtotal', totalsX, doc.y, { width: 90, continued: true });
      doc.text(`USD ${Number(order.subtotal).toFixed(2)}`, { align: 'right' });
      doc.text('Discount', totalsX, doc.y, { width: 90, continued: true });
      doc.text(`USD ${Number(order.discount).toFixed(2)}`, { align: 'right' });
      doc.text('Tax', totalsX, doc.y, { width: 90, continued: true });
      doc.text(`USD ${Number(order.tax).toFixed(2)}`, { align: 'right' });
      doc.fontSize(12).text('Total', totalsX, doc.y + 4, { width: 90, continued: true });
      doc.text(`USD ${Number(order.total).toFixed(2)}`, { align: 'right' });
      doc.fontSize(10).text('Paid', totalsX, doc.y + 8, { width: 90, continued: true });
      doc.text(`USD ${paidAmount.toFixed(2)}`, { align: 'right' });
      doc.text('Balance Due', totalsX, doc.y, { width: 90, continued: true });
      doc.text(`USD ${balanceDue.toFixed(2)}`, { align: 'right' });

      doc.moveDown(2);
      doc.fontSize(10).text(`Order Status: ${order.status}`);
      doc.text(`Payment Status: ${order.paymentStatus}`);
      if (order.notes) {
        doc.moveDown(1);
        doc.text('Notes', { underline: true });
        doc.text(order.notes);
      }

      doc.moveDown(2);
      doc.fontSize(8).fillColor('gray').text('Generated by Periphex peripheral management system.');
      doc.end();
    });
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


