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
import { CreateNotificationDto, NotificationQueryDto } from './dto/notification.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getMyNotifications(
    @Req() req: Request & { user: { userId: string } },
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getMyNotifications(req.user.userId, query);
  }

  @Patch('read-all')
  async markAllAsRead(@Req() req: Request & { user: { userId: string } }) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }

  @Patch(':id/read')
  async markAsRead(
    @Req() req: Request & { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.notificationService.markAsRead(req.user.userId, id);
  }

  @Post()
  @Roles(Role.ADMIN)
  async createNotification(@Body() dto: CreateNotificationDto) {
    return this.notificationService.createNotification(dto);
  }
}
