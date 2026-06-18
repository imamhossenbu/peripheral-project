import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Status } from '../../generated/prisma';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    // 1. Get counts
    const [totalUsers, totalDevices, totalCategories] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.device.count(),
      this.prisma.category.count(),
    ]);

    // 2. Get users by role
    const usersByRoleList = await this.prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    });

    const usersByRole = {
      ADMIN: 0,
      EDITOR: 0,
      VIEWER: 0,
    };
    for (const group of usersByRoleList) {
      if (group.role in usersByRole) {
        usersByRole[group.role as Role] = group._count._all;
      }
    }

    // 3. Get devices by status
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

    // 4. Get total inventory value
    const aggregatePrice = await this.prisma.device.aggregate({
      _sum: { price: true },
    });
    const totalInventoryValue = aggregatePrice._sum.price
      ? Number(aggregatePrice._sum.price)
      : 0;

    // 5. Get recent inventory logs (last 10)
    const recentLogs = await this.prisma.inventoryLog.findMany({
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

    // 6. Get recent registered users (last 5)
    const recentUsersRaw = await this.prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    const recentUsers = recentUsersRaw.map((u) => {
      const { password, verificationToken, ...userWithoutPassword } = u;
      return userWithoutPassword;
    });

    return {
      counts: {
        users: totalUsers,
        devices: totalDevices,
        categories: totalCategories,
      },
      usersByRole,
      devicesByStatus,
      totalInventoryValue,
      recentLogs,
      recentUsers,
    };
  }
}
