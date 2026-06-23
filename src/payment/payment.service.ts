import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
} from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentDto,
  PaymentQueryDto,
  UpdatePaymentDto,
} from './dto/payment.dto';

interface SslCommerzPayload {
  [key: string]: string | undefined;
  tran_id?: string;
  val_id?: string;
  status?: string;
  amount?: string;
  currency?: string;
  card_type?: string;
  bank_tran_id?: string;
}

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

  async createSslCommerzSession(orderId: string) {
    const config = this.getSslCommerzConfig();
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: { include: { device: { include: { category: true } } } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const tranId = `PX-${Date.now()}-${order.id.slice(-6)}`;
    const customerName =
      [order.user.firstName, order.user.lastName].filter(Boolean).join(' ') ||
      order.user.email;
    const firstItem = order.items[0];
    const productName = firstItem
      ? `${firstItem.device.name}${order.items.length > 1 ? ` + ${order.items.length - 1} more` : ''}`
      : 'Peripheral order';
    const productCategory = firstItem?.device.category?.name || 'Peripheral';

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        amount: Number(order.total),
        method: PaymentMethod.CARD,
        status: PaymentTransactionStatus.PENDING,
        transactionId: tranId,
        provider: 'SSLCOMMERZ',
        notes: 'SSLCommerz session initiated',
      },
    });

    const successUrl = `${config.backendUrl}/payments/sslcommerz/success`;
    const failUrl = `${config.backendUrl}/payments/sslcommerz/fail`;
    const cancelUrl = `${config.backendUrl}/payments/sslcommerz/cancel`;
    const ipnUrl = `${config.backendUrl}/payments/sslcommerz/ipn`;

    const body = new URLSearchParams({
      store_id: config.storeId,
      store_passwd: config.storePassword,
      total_amount: Number(order.total).toFixed(2),
      currency: config.currency,
      tran_id: tranId,
      success_url: successUrl,
      fail_url: failUrl,
      cancel_url: cancelUrl,
      ipn_url: ipnUrl,
      cus_name: customerName,
      cus_email: order.user.email,
      cus_add1: order.user.department || 'N/A',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      cus_phone: '01700000000',
      shipping_method: 'NO',
      product_name: productName,
      product_category: productCategory,
      product_profile: 'general',
      value_a: order.id,
      value_b: order.userId,
    });

    const response = await axios.post(config.initUrl, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!response.data?.GatewayPageURL) {
      await this.markTransaction(
        tranId,
        PaymentTransactionStatus.FAILED,
        'SSLCommerz session creation failed',
      );
      throw new BadRequestException(
        response.data?.failedreason || 'SSLCommerz session creation failed',
      );
    }

    return {
      paymentUrl: response.data.GatewayPageURL,
      gatewayUrl: response.data.GatewayPageURL,
      transactionId: tranId,
      sessionKey: response.data.sessionkey,
      orderId: order.id,
    };
  }

  async handleSslCommerzCallback(
    kind: 'success' | 'fail' | 'cancel' | 'ipn',
    payload: SslCommerzPayload,
  ) {
    const tranId = payload.tran_id;
    if (!tranId) {
      throw new BadRequestException('SSLCommerz transaction ID missing');
    }

    if (kind === 'fail') {
      return this.markTransaction(
        tranId,
        PaymentTransactionStatus.FAILED,
        'SSLCommerz payment failed',
      );
    }

    if (kind === 'cancel') {
      return this.markTransaction(
        tranId,
        PaymentTransactionStatus.FAILED,
        'SSLCommerz payment cancelled',
      );
    }

    const validation = await this.validateSslCommerzPayment(payload);
    const isValid = ['VALID', 'VALIDATED'].includes(
      String(validation.status || payload.status).toUpperCase(),
    );

    if (!isValid) {
      return this.markTransaction(
        tranId,
        PaymentTransactionStatus.FAILED,
        'SSLCommerz validation failed',
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { transactionId: tranId },
    });
    if (!payment) {
      throw new NotFoundException(`Payment transaction ${tranId} not found`);
    }

    const validationTranId = validation.tran_id || payload.tran_id;
    if (validationTranId !== tranId) {
      return this.markTransaction(
        tranId,
        PaymentTransactionStatus.FAILED,
        'SSLCommerz transaction mismatch',
      );
    }

    const paidAmount = parseFloat(validation.amount || payload.amount || '0');
    const expectedAmount = Number(payment.amount);
    if (
      !Number.isFinite(paidAmount) ||
      Math.abs(paidAmount - expectedAmount) > 0.01
    ) {
      return this.markTransaction(
        tranId,
        PaymentTransactionStatus.FAILED,
        'SSLCommerz amount mismatch',
      );
    }

    const paidCurrency = String(
      validation.currency || payload.currency || '',
    ).toUpperCase();
    if (
      paidCurrency &&
      paidCurrency !== this.getSslCommerzConfig().currency.toUpperCase()
    ) {
      return this.markTransaction(
        tranId,
        PaymentTransactionStatus.FAILED,
        'SSLCommerz currency mismatch',
      );
    }

    return this.markTransaction(
      tranId,
      PaymentTransactionStatus.SUCCESS,
      `SSLCommerz payment successful. Card: ${payload.card_type || validation.card_type || 'N/A'}`,
      validation.bank_tran_id || payload.bank_tran_id,
    );
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

  private async validateSslCommerzPayment(payload: SslCommerzPayload) {
    const config = this.getSslCommerzConfig();
    if (!payload.val_id) {
      throw new BadRequestException('SSLCommerz validation ID missing');
    }

    const response = await axios.get(config.validationUrl, {
      params: {
        val_id: payload.val_id,
        store_id: config.storeId,
        store_passwd: config.storePassword,
        v: 1,
        format: 'json',
      },
    });

    return response.data || {};
  }

  private async markTransaction(
    transactionId: string,
    status: PaymentTransactionStatus,
    notes: string,
    bankTransactionId?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { transactionId },
    });
    if (!payment) {
      throw new NotFoundException(
        `Payment transaction ${transactionId} not found`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status,
          paidAt:
            status === PaymentTransactionStatus.SUCCESS
              ? new Date()
              : payment.paidAt,
          notes: bankTransactionId
            ? `${notes}. Bank transaction: ${bankTransactionId}`
            : notes,
        },
      });

      await this.syncOrderPaymentStatus(tx, payment.orderId);
      return result;
    });

    return this.findOne(updated.id);
  }

  private getSslCommerzConfig() {
    const storeId = process.env.STORE_ID;
    const storePassword = process.env.STORE_PASSWORD;
    const backendUrl =
      process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;
    const isLive = process.env.IS_LIVE === 'true';

    if (!storeId || !storePassword) {
      throw new BadRequestException(
        'SSLCommerz credentials are not configured',
      );
    }

    const host = isLive
      ? 'https://securepay.sslcommerz.com'
      : 'https://sandbox.sslcommerz.com';

    return {
      storeId,
      storePassword,
      backendUrl,
      currency: process.env.SSLCOMMERZ_CURRENCY || 'BDT',
      frontendSuccessUrl:
        process.env.FRONTEND_PAYMENT_SUCCESS_URL ||
        'http://localhost:3000/payment-success',
      frontendFailUrl:
        process.env.FRONTEND_PAYMENT_FAIL_URL ||
        'http://localhost:3000/payment-cancelled',
      frontendCancelUrl:
        process.env.FRONTEND_PAYMENT_CANCEL_URL ||
        'http://localhost:3000/payment-cancelled',
      initUrl: `${host}/gwprocess/v4/api.php`,
      validationUrl: `${host}/validator/api/validationserverAPI.php`,
    };
  }

  getSslCommerzRedirectUrl(kind: 'success' | 'fail' | 'cancel') {
    const config = this.getSslCommerzConfig();
    if (kind === 'success') return config.frontendSuccessUrl;
    if (kind === 'fail') return config.frontendFailUrl;
    return config.frontendCancelUrl;
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
        (payment: Payment) =>
          payment.status === PaymentTransactionStatus.SUCCESS,
      )
      .reduce(
        (sum: number, payment: Payment) => sum + Number(payment.amount),
        0,
      );
    const refunded = order.payments
      .filter(
        (payment: Payment) =>
          payment.status === PaymentTransactionStatus.REFUNDED,
      )
      .reduce(
        (sum: number, payment: Payment) => sum + Number(payment.amount),
        0,
      );

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
