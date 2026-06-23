import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Payment,
  PaymentStatus,
  PaymentTransactionStatus,
} from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentDto,
  PaymentQueryDto,
  UpdatePaymentDto,
} from './dto/payment.dto';

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaymentQueryDto) {
    const { page, limit, orderId, userId, status, method } = query;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (orderId) where.orderId = orderId;
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (method) where.method = method;

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        include: {
          order: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return payment;
  }

  async create(dto: CreatePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${dto.orderId} not found`);
    }

    const userId = dto.userId ?? order.userId;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (dto.transactionId) {
      const existing = await this.prisma.payment.findUnique({
        where: { transactionId: dto.transactionId },
      });
      if (existing) {
        throw new BadRequestException('Transaction ID already exists');
      }
    }

    const status = dto.status ?? PaymentTransactionStatus.PENDING;
    const paidAt =
      dto.paidAt ??
      (status === PaymentTransactionStatus.SUCCESS ? new Date() : undefined);

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderId: dto.orderId,
          userId,
          amount: dto.amount,
          method: dto.method,
          status,
          transactionId: dto.transactionId,
          provider: dto.provider,
          paidAt: typeof paidAt === 'string' ? new Date(paidAt) : paidAt,
          notes: dto.notes,
        },
      });

      await this.syncOrderPaymentStatus(tx, dto.orderId);
      return created;
    });

    return this.findOne(payment.id);
  }

  async update(id: string, dto: UpdatePaymentDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    if (dto.transactionId && dto.transactionId !== payment.transactionId) {
      const existing = await this.prisma.payment.findUnique({
        where: { transactionId: dto.transactionId },
      });
      if (existing) {
        throw new BadRequestException('Transaction ID already exists');
      }
    }

    const paidAt =
      dto.paidAt ??
      (dto.status === PaymentTransactionStatus.SUCCESS && !payment.paidAt
        ? new Date()
        : undefined);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.update({
        where: { id },
        data: {
          amount: dto.amount,
          method: dto.method,
          status: dto.status,
          transactionId: dto.transactionId,
          provider: dto.provider,
          paidAt: typeof paidAt === 'string' ? new Date(paidAt) : paidAt,
          notes: dto.notes,
        },
      });

      await this.syncOrderPaymentStatus(tx, payment.orderId);
      return result;
    });

    return this.findOne(updated.id);
  }

  async remove(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.delete({
        where: { id },
      });

      await this.syncOrderPaymentStatus(tx, payment.orderId);
      return result;
    });

    return {
      message: 'Payment deleted successfully',
      id: deleted.id,
    };
  }

  private async syncOrderPaymentStatus(tx: any, orderId: string) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });

    if (!order) return;

    const total = Number(order.total);
    const paid = order.payments
      .filter(
        (payment: Payment) => payment.status === PaymentTransactionStatus.SUCCESS,
      )
      .reduce((sum: number, payment: Payment) => sum + Number(payment.amount), 0);
    const refunded = order.payments
      .filter(
        (payment: Payment) => payment.status === PaymentTransactionStatus.REFUNDED,
      )
      .reduce((sum: number, payment: Payment) => sum + Number(payment.amount), 0);

    let paymentStatus: PaymentStatus = PaymentStatus.UNPAID;
    if (total > 0 && refunded >= total) {
      paymentStatus = PaymentStatus.REFUNDED;
    } else if (paid >= total) {
      paymentStatus = PaymentStatus.PAID;
    } else if (paid > 0) {
      paymentStatus = PaymentStatus.PARTIAL;
    }

    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus },
    });
  }
}
