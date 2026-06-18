import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto, NotificationQueryDto } from './dto/notification.dto';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async getMyNotifications(userId: string, query: NotificationQueryDto) {
    const { page, limit, isRead } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    const [total, notifications] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    if (notification.userId !== userId) {
      throw new BadRequestException('You do not own this notification');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { message: 'All notifications marked as read' };
  }

  async createNotification(dto: CreateNotificationDto) {
    if (dto.userId.toUpperCase() === 'ALL') {
      const users = await this.prisma.user.findMany({
        select: { id: true },
      });

      if (users.length > 0) {
        await this.prisma.notification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            message: dto.message,
            type: dto.type.toUpperCase(),
          })),
        });
      }

      return { message: `Notification broadcasted to all ${users.length} users` };
    }

    // Specific user validation
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        message: dto.message,
        type: dto.type.toUpperCase(),
      },
    });
  }
}
