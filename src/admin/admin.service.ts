import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Role,
  Status,
  BorrowStatus,
  OrderStatus,
  FineStatus,
  PaymentTransactionStatus,
} from '../../generated/prisma';

const LOW_STOCK_THRESHOLD = 5;
const TREND_DAYS = 7;

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const [
      counts,
      usersByRole,
      devicesByStatus,
      totalInventoryValue,
      recentLogs,
      recentUsers,
      borrowStats,
      orderRevenueStats,
      fineStats,
      lowStockVariants,
      trends,
    ] = await Promise.all([
      this.getCounts(),
      this.getUsersByRole(),
      this.getDevicesByStatus(),
      this.getTotalInventoryValue(),
      this.getRecentLogs(),
      this.getRecentUsers(),
      this.getBorrowStats(),
      this.getOrderRevenueStats(),
      this.getFineStats(),
      this.getLowStockVariants(),
      this.getLast7DaysTrends(),
    ]);

    return {
      counts,
      usersByRole,
      devicesByStatus,
      totalInventoryValue,
      recentLogs,
      recentUsers,
      borrow: borrowStats,
      ordersAndRevenue: orderRevenueStats,
      fines: fineStats,
      lowStockVariants,
      trends,
    };
  }

  private async getCounts() {
    const [totalUsers, totalDevices, totalCategories] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.device.count(),
      this.prisma.category.count(),
    ]);

    return {
      users: totalUsers,
      devices: totalDevices,
      categories: totalCategories,
    };
  }

  private async getUsersByRole() {
    const usersByRoleList = await this.prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    });

    const usersByRole = {
      ADMIN: 0,
      STAFF: 0,
      STUDENT: 0,
    };
    for (const group of usersByRoleList) {
      if (group.role in usersByRole) {
        usersByRole[group.role as Role] = group._count._all;
      }
    }

    return usersByRole;
  }

  private async getDevicesByStatus() {
    const devicesByStatusList = await this.prisma.device.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const devicesByStatus = {
      AVAILABLE: 0,
      IN_MAINTENANCE: 0,
      DEPLOYED: 0,
      RETIRED: 0,
    };
    for (const group of devicesByStatusList) {
      if (group.status in devicesByStatus) {
        devicesByStatus[group.status as Status] = group._count._all;
      }
    }

    return devicesByStatus;
  }

  private async getTotalInventoryValue() {
    const aggregatePrice = await this.prisma.device.aggregate({
      _sum: { price: true },
    });
    return aggregatePrice._sum.price ? Number(aggregatePrice._sum.price) : 0;
  }

  private async getRecentLogs() {
    return this.prisma.inventoryLog.findMany({
      take: 10,
      orderBy: { performedAt: 'desc' },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            serialNumber: true,
          },
        },
      },
    });
  }

  private async getRecentUsers() {
    const recentUsersRaw = await this.prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    return recentUsersRaw.map((u) => {
      const {
        password,
        verificationToken,
        resetPasswordToken,
        ...userWithoutSensitive
      } = u;
      return userWithoutSensitive;
    });
  }

  // ── Borrow requests: status breakdown + overdue list ──────────────
  private async getBorrowStats() {
    const statusList = await this.prisma.borrowRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const byStatus = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      RETURNED: 0,
    };
    for (const group of statusList) {
      if (group.status in byStatus) {
        byStatus[group.status as BorrowStatus] = group._count._all;
      }
    }

    const now = new Date();
    const overdueRequests = await this.prisma.borrowRequest.findMany({
      where: {
        status: BorrowStatus.APPROVED,
        endDate: { lt: now },
      },
      orderBy: { endDate: 'asc' },
      include: {
        device: { select: { id: true, name: true, serialNumber: true } },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const overdue = overdueRequests.map((req) => {
      const daysOverdue = Math.floor(
        (now.getTime() - req.endDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        id: req.id,
        device: req.device,
        user: req.user,
        endDate: req.endDate,
        daysOverdue,
      };
    });

    return {
      byStatus,
      pendingCount: byStatus.PENDING,
      overdueCount: overdue.length,
      overdue,
    };
  }

  // ── Orders & revenue ───────────────────────────────────────────────
  private async getOrderRevenueStats() {
    const statusList = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const byStatus = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    for (const group of statusList) {
      if (group.status in byStatus) {
        byStatus[group.status as OrderStatus] = group._count._all;
      }
    }

    const totalOrders = await this.prisma.order.count();

    // Total revenue = সব successful payment এর sum (order.total না, কারণ
    // revenue মানে আসলে যা টাকা আদায় হয়েছে)
    const totalRevenueAgg = await this.prisma.payment.aggregate({
      where: { status: PaymentTransactionStatus.SUCCESS },
      _sum: { amount: true },
    });
    const totalRevenue = totalRevenueAgg._sum.amount
      ? Number(totalRevenueAgg._sum.amount)
      : 0;

    // চলতি মাসের revenue (paidAt চলতি মাসে)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRevenueAgg = await this.prisma.payment.aggregate({
      where: {
        status: PaymentTransactionStatus.SUCCESS,
        paidAt: { gte: monthStart },
      },
      _sum: { amount: true },
    });
    const monthlyRevenue = monthRevenueAgg._sum.amount
      ? Number(monthRevenueAgg._sum.amount)
      : 0;

    return {
      totalOrders,
      byStatus,
      totalRevenue,
      monthlyRevenue,
    };
  }

  // ── Fines ───────────────────────────────────────────────────────────
  private async getFineStats() {
    const unpaidAgg = await this.prisma.fine.aggregate({
      where: { status: FineStatus.UNPAID },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const [unpaidCount, paidCount, waivedCount] = await Promise.all([
      this.prisma.fine.count({ where: { status: FineStatus.UNPAID } }),
      this.prisma.fine.count({ where: { status: FineStatus.PAID } }),
      this.prisma.fine.count({ where: { status: FineStatus.WAIVED } }),
    ]);

    return {
      unpaidTotal: unpaidAgg._sum.amount ? Number(unpaidAgg._sum.amount) : 0,
      unpaidCount,
      paidCount,
      waivedCount,
    };
  }

  // ── Low stock variants ───────────────────────────────────────────────
  private async getLowStockVariants() {
    const variants = await this.prisma.deviceVariant.findMany({
      where: {
        isActive: true,
        stock: { lte: LOW_STOCK_THRESHOLD },
      },
      orderBy: { stock: 'asc' },
      include: {
        device: { select: { id: true, name: true, serialNumber: true } },
      },
    });

    return variants.map((v) => ({
      variantId: v.id,
      variantName: v.name,
      stock: v.stock,
      device: v.device,
    }));
  }

  // ── Last 7 days trend: orders created + borrow requests created ─────
  private async getLast7DaysTrends() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: { date: string; start: Date; end: Date }[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(today.getDate() - i);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      days.push({
        date: start.toISOString().slice(0, 10), // YYYY-MM-DD
        start,
        end,
      });
    }

    const rangeStart = days[0].start;

    const [ordersInRange, borrowsInRange] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
      this.prisma.borrowRequest.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
    ]);

    const ordersTrend = days.map(({ date, start, end }) => ({
      date,
      count: ordersInRange.filter(
        (o) => o.createdAt >= start && o.createdAt < end,
      ).length,
    }));

    const borrowsTrend = days.map(({ date, start, end }) => ({
      date,
      count: borrowsInRange.filter(
        (b) => b.createdAt >= start && b.createdAt < end,
      ).length,
    }));

    return {
      orders: ordersTrend,
      borrowRequests: borrowsTrend,
    };
  }
}
