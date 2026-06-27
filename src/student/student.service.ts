import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BorrowStatus,
  FineStatus,
  PaymentTransactionStatus,
} from '../../generated/prisma';

@Injectable()
export class StudentDashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(userId: string) {
    const [
      borrowStats,
      orderStats,
      fineStats,
      activeBorrows,
      recentOrders,
      pendingFines,
    ] = await Promise.all([
      this.getBorrowStats(userId),
      this.getOrderStats(userId),
      this.getFineStats(userId),
      this.getActiveBorrows(userId),
      this.getRecentOrders(userId),
      this.getPendingFines(userId),
    ]);

    return {
      borrowStats,
      orderStats,
      fineStats,
      activeBorrows,
      recentOrders,
      pendingFines,
    };
  }

  // ── Borrow counts by status ───────────────────────────────────────────────

  private async getBorrowStats(userId: string) {
    const groups = await this.prisma.borrowRequest.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });

    const byStatus = { PENDING: 0, APPROVED: 0, REJECTED: 0, RETURNED: 0 };
    for (const g of groups) {
      if (g.status in byStatus) {
        byStatus[g.status as BorrowStatus] = g._count._all;
      }
    }

    // Overdue = APPROVED এ আছে কিন্তু endDate পেরিয়ে গেছে
    const overdueCount = await this.prisma.borrowRequest.count({
      where: {
        userId,
        status: BorrowStatus.APPROVED,
        endDate: { lt: new Date() },
      },
    });

    return { byStatus, overdueCount };
  }

  // ── Order counts + total spent ────────────────────────────────────────────

  private async getOrderStats(userId: string) {
    const [groups, spentAgg] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: { userId, status: PaymentTransactionStatus.SUCCESS },
        _sum: { amount: true },
      }),
    ]);

    const byStatus = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, CANCELLED: 0 };
    for (const g of groups) {
      if (g.status in byStatus) {
        byStatus[g.status as keyof typeof byStatus] = g._count._all;
      }
    }

    const totalOrders = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const totalSpent = spentAgg._sum.amount ? Number(spentAgg._sum.amount) : 0;

    return { byStatus, totalOrders, totalSpent };
  }

  // ── Fine summary ──────────────────────────────────────────────────────────

  private async getFineStats(userId: string) {
    const [unpaidAgg, paidCount] = await Promise.all([
      this.prisma.fine.aggregate({
        where: { userId, status: FineStatus.UNPAID },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.fine.count({
        where: { userId, status: FineStatus.PAID },
      }),
    ]);

    return {
      unpaidTotal: unpaidAgg._sum.amount ? Number(unpaidAgg._sum.amount) : 0,
      unpaidCount: unpaidAgg._count._all,
      paidCount,
    };
  }

  // ── Active borrows (APPROVED) — countdown এর জন্য ────────────────────────

  private async getActiveBorrows(userId: string) {
    return this.prisma.borrowRequest.findMany({
      where: { userId, status: BorrowStatus.APPROVED },
      orderBy: { endDate: 'asc' }, // সবচেয়ে আগে return করতে হবে সেটা উপরে
      include: {
        device: {
          select: {
            id: true,
            name: true,
            images: {
              where: { isPrimary: true },
              select: { url: true },
              take: 1,
            },
          },
        },
        variant: { select: { id: true, name: true } },
      },
    });
  }

  // ── Recent orders (last 5) ────────────────────────────────────────────────

  private async getRecentOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        invoice: { select: { invoiceNumber: true, status: true } },
        items: {
          take: 1,
          include: {
            device: { select: { name: true } },
          },
        },
      },
    });
  }

  // ── Unpaid fines (for alert banner) ──────────────────────────────────────

  private async getPendingFines(userId: string) {
    return this.prisma.fine.findMany({
      where: { userId, status: FineStatus.UNPAID },
      orderBy: { createdAt: 'desc' },
      include: {
        borrowRequest: {
          include: {
            device: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
