import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { NotificationService } from './notification.service';
import {
  CreateNotificationDto,
  NotificationQueryDto,
} from './dto/notification.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: Role };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // ─── নিজের notifications (filtered, paginated) ──────────────
  @Get()
  getMyNotifications(
    @Req() req: AuthRequest,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getMyNotifications(req.user.userId, query);
  }

  // ─── Unread count — bell icon badge এর জন্য ─────────────────
  // NOTE: 'unread-count' কে ':id' এর আগে রাখতে হবে
  @Get('unread-count')
  getUnreadCount(@Req() req: AuthRequest) {
    return this.notificationService.getUnreadCount(req.user.userId);
  }

  // ─── সব read mark ────────────────────────────────────────────
  @Patch('read-all')
  markAllAsRead(@Req() req: AuthRequest) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }

  // ─── Single read mark ────────────────────────────────────────
  @Patch(':id/read')
  markAsRead(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.notificationService.markAsRead(req.user.userId, id);
  }

  // ─── ADMIN: notification পাঠানো ──────────────────────────────
  @Post()
  @Roles(Role.ADMIN)
  createNotification(@Body() dto: CreateNotificationDto) {
    return this.notificationService.createNotification(dto);
  }
}
