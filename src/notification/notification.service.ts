import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNotificationDto,
  NotificationQueryDto,
  NotificationType,
} from './dto/notification.dto';
import { Role } from '../../generated/prisma';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  // ─── নিজের notifications (filtered, paginated) ────────────

  async getMyNotifications(userId: string, query: NotificationQueryDto) {
    const { page, limit, isRead, type } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (isRead !== undefined) where.isRead = isRead;
    if (type) where.type = type;

    const [total, notifications] = await Promise.all([
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

  // ─── Unread count ────────────────────────────────────────

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  // ─── Single read mark ────────────────────────────────────

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  // ─── সব read mark ────────────────────────────────────────

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { updated: result.count };
  }

  // ─── Single notification create (admin panel / internal) ─

  async createNotification(dto: CreateNotificationDto) {
    // userId === "ALL" হলে সব user-কে broadcast
    if (dto.userId === 'ALL') {
      return this.broadcastToAll(dto.message, dto.type);
    }

    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        message: dto.message,
        type: dto.type,
      },
    });
  }

  // ─── Broadcast to all users ───────────────────────────────

  async broadcastToAll(message: string, type: NotificationType) {
    const users = await this.prisma.user.findMany({
      select: { id: true },
    });

    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        message,
        type,
      })),
    });

    return { sent: users.length, message };
  }

  // ─── Notify by role (ADMIN / STAFF) ──────────────────────
  // Device service এবং অন্য service থেকে call হবে

  async notifyAdminsAndStaff({
    message,
    type,
  }: {
    message: string;
    type: NotificationType;
  }) {
    const targets = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.STAFF] } },
      select: { id: true },
    });

    if (targets.length === 0) return;

    await this.prisma.notification.createMany({
      data: targets.map((u) => ({
        userId: u.id,
        message,
        type,
      })),
    });
  }

  // ─── Notify specific users (array) ───────────────────────
  // BorrowService, FineService, etc. থেকে reuse হবে

  async notifyUsers({
    userIds,
    message,
    type,
  }: {
    userIds: string[];
    message: string;
    type: NotificationType;
  }) {
    if (userIds.length === 0) return;

    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, message, type })),
    });
  }

  // ─── Single user notify (shorthand) ──────────────────────

  async notifyUser({
    userId,
    message,
    type,
  }: {
    userId: string;
    message: string;
    type: NotificationType;
  }) {
    return this.prisma.notification.create({
      data: { userId, message, type },
    });
  }
}
