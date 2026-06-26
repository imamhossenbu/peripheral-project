import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { OrderStatus, PaymentTransactionStatus } from '../../generated/prisma';
import type { Device, DeviceVariant } from '../../generated/prisma';
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
          items: { include: { device: true, variant: true } },
          payments: true,
          invoice: true,
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
        items: { include: { device: true, variant: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        invoice: { include: { items: true } },
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
    const devices: Device[] = await this.prisma.device.findMany({
      where: { id: { in: deviceIds } },
    });
    const deviceMap = new Map<string, Device>(
      devices.map((device) => [device.id, device]),
    );

    for (const deviceId of deviceIds) {
      if (!deviceMap.has(deviceId)) {
        throw new NotFoundException(`Device with ID ${deviceId} not found`);
      }
    }

    // variant দেওয়া item গুলোর জন্য variant exist করে ও সঠিক device এর কিনা check
    const variantIds = [
      ...new Set(
        dto.items
          .map((item) => item.variantId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const variants: DeviceVariant[] = variantIds.length
      ? await this.prisma.deviceVariant.findMany({
          where: { id: { in: variantIds } },
        })
      : [];
    const variantMap = new Map<string, DeviceVariant>(
      variants.map((variant) => [variant.id, variant]),
    );

    for (const item of dto.items) {
      if (!item.variantId) continue;
      const variant = variantMap.get(item.variantId);
      if (!variant) {
        throw new NotFoundException(
          `Variant with ID ${item.variantId} not found`,
        );
      }
      if (variant.deviceId !== item.deviceId) {
        throw new BadRequestException(
          `Variant ${item.variantId} does not belong to device ${item.deviceId}`,
        );
      }
    }

    const items = dto.items.map((item) => {
      const device = deviceMap.get(item.deviceId)!;
      const variant = item.variantId ? variantMap.get(item.variantId) : null;
      const unitPrice =
        item.unitPrice ?? Number(variant?.price ?? device.price);
      const total = unitPrice * item.quantity;

      return {
        deviceId: item.deviceId,
        variantId: item.variantId,
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

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
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
          items: { include: { device: true, variant: true } },
          payments: true,
        },
      });

      // Admin দের notification পাঠাও
      const admins = await tx.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      });
      if (admins.length > 0) {
        const customerName =
          [order.user.firstName, order.user.lastName]
            .filter(Boolean)
            .join(' ') || order.user.email;
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            message: `New order ${order.orderNumber} placed by ${customerName}. Total: ${Number(order.total).toFixed(2)}.`,
            type: 'ORDER_CREATED',
          })),
        });
      }

      return order;
    });
  }

  async update(id: string, dto: UpdateOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
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

    // PENDING -> PROCESSING transition ("order confirm") এ stock decrement
    const isConfirming =
      dto.status === OrderStatus.PROCESSING &&
      order.status === OrderStatus.PENDING;

    return this.prisma.$transaction(async (tx) => {
      if (isConfirming) {
        // variant থাকা item গুলোর stock আগে check করো, তারপর decrement
        const variantItems = order.items.filter((item) => item.variantId);
        for (const item of variantItems) {
          const variant = await tx.deviceVariant.findUnique({
            where: { id: item.variantId! },
          });
          if (!variant || variant.stock < item.quantity) {
            throw new BadRequestException(
              `Cannot confirm order: insufficient stock for variant ${item.variantId}`,
            );
          }
        }
        for (const item of variantItems) {
          await tx.deviceVariant.update({
            where: { id: item.variantId! },
            data: { stock: { decrement: item.quantity } },
          });
          await tx.inventoryLog.create({
            data: {
              deviceId: item.deviceId,
              action: 'SALE',
              remarks: `Order ${order.orderNumber} confirmed. Qty ${item.quantity} (variant ${item.variantId}) decremented.`,
            },
          });
        }
      }

      const updated = await tx.order.update({
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
          items: { include: { device: true, variant: true } },
          payments: true,
          invoice: true,
        },
      });

      if (dto.status && dto.status !== order.status) {
        await tx.notification.create({
          data: {
            userId: order.userId,
            message: `Your order ${order.orderNumber} status changed to ${dto.status}.`,
            type: 'ORDER_UPDATE',
          },
        });
      }

      return updated;
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

  // Order PAID হলে call হয় (syncOrderPaymentStatus থেকে) — Invoice persist করে,
  // না থাকলে create করে, থাকলে সেটাই ফেরত দেয় (idempotent)
  async ensureInvoiceForPaidOrder(orderId: string) {
    const existing = await this.prisma.invoice.findUnique({
      where: { orderId },
    });
    if (existing) return existing;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { device: true, variant: true } } },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const invoiceNumber = await this.generateInvoiceNumber();

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          orderId: order.id,
          userId: order.userId,
          subtotal: order.subtotal,
          discount: order.discount,
          tax: order.tax,
          total: order.total,
          paidAt: new Date(),
          items: {
            create: order.items.map((item) => ({
              deviceName: item.device.name,
              variantName: item.variant?.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          },
        },
        include: { items: true },
      });

      await tx.notification.create({
        data: {
          userId: order.userId,
          message: `Invoice ${invoice.invoiceNumber} has been issued for your order ${order.orderNumber}.`,
          type: 'INVOICE_ISSUED',
        },
      });

      return invoice;
    });
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
        .filter(
          (payment) => payment.status === PaymentTransactionStatus.SUCCESS,
        )
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      const balanceDue = Math.max(Number(order.total) - paidAmount, 0);
      const customerName =
        [order.user.firstName, order.user.lastName].filter(Boolean).join(' ') ||
        order.user.email;

      const isIssued = Boolean(order.invoice);
      const headerLabel = isIssued
        ? 'Periphex Invoice'
        : 'Periphex Proforma Invoice (Draft)';
      const docNumber = order.invoice?.invoiceNumber ?? order.orderNumber;

      doc.fontSize(22).text(headerLabel, { align: 'right' });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .text(`${isIssued ? 'Invoice' : 'Order'}: ${docNumber}`, {
          align: 'right',
        });
      doc.text(`Created: ${order.createdAt.toLocaleDateString()}`, {
        align: 'right',
      });
      if (!isIssued) {
        doc
          .fillColor('gray')
          .text('Draft — not yet issued, generated from live order data', {
            align: 'right',
          });
        doc.fillColor('black');
      }
      doc.moveDown(2);

      doc.fontSize(12).text('Bill To', { underline: true });
      doc.fontSize(10).text(customerName);
      doc.text(order.user.email);
      if (order.user.department)
        doc.text(`Department: ${order.user.department}`);
      doc.moveDown(1.5);

      doc.fontSize(12).text('Order Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9);
      doc.text('Item', 50, doc.y, { width: 210, continued: true });
      doc.text('Qty', 260, doc.y, {
        width: 45,
        align: 'right',
        continued: true,
      });
      doc.text('Unit', 320, doc.y, {
        width: 80,
        align: 'right',
        continued: true,
      });
      doc.text('Total', 425, doc.y, { width: 90, align: 'right' });
      doc
        .moveTo(50, doc.y + 4)
        .lineTo(545, doc.y + 4)
        .stroke();
      doc.moveDown(0.7);

      const lineItems = isIssued
        ? order.invoice!.items.map((item) => ({
            name: item.variantName
              ? `${item.deviceName} (${item.variantName})`
              : item.deviceName,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            total: Number(item.total),
          }))
        : order.items.map((item) => ({
            name: item.variant
              ? `${item.device.name} (${item.variant.name})`
              : `${item.device.name} (${item.device.brand} ${item.device.model})`,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            total: Number(item.total),
          }));

      for (const item of lineItems) {
        const y = doc.y;
        doc.text(item.name, 50, y, { width: 210 });
        doc.text(String(item.quantity), 260, y, { width: 45, align: 'right' });
        doc.text(`USD ${item.unitPrice.toFixed(2)}`, 320, y, {
          width: 80,
          align: 'right',
        });
        doc.text(`USD ${item.total.toFixed(2)}`, 425, y, {
          width: 90,
          align: 'right',
        });
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
      doc
        .fontSize(12)
        .text('Total', totalsX, doc.y + 4, { width: 90, continued: true });
      doc.text(`USD ${Number(order.total).toFixed(2)}`, { align: 'right' });
      doc
        .fontSize(10)
        .text('Paid', totalsX, doc.y + 8, { width: 90, continued: true });
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
      doc
        .fontSize(8)
        .fillColor('gray')
        .text('Generated by Periphex peripheral management system.');
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

  private async generateInvoiceNumber() {
    const date = new Date();
    const prefix = `INV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const count = await this.prisma.invoice.count({
      where: {
        invoiceNumber: {
          startsWith: prefix,
        },
      },
    });

    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }
}
