import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { OrderMessageService } from './order-message.service';

import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Role } from '../../generated/prisma';
import { OrderTrackingService } from '../order-tracking/tracking.service';

type AuthRequest = Request & { user: { userId: string; role: Role } };

@Controller('orders/:orderId/messages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderMessageController {
  constructor(
    private messageService: OrderMessageService,
    private trackingService: OrderTrackingService,
  ) {}

  @Get()
  async getHistory(
    @Param('orderId') orderId: string,
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
  ) {
    if (req.user.role === Role.STUDENT) {
      const owns = await this.trackingService.verifyOwnership(
        orderId,
        req.user.userId,
      );
      if (!owns) {
        throw new ForbiddenException('You can only view your own order chat');
      }
    }

    return this.messageService.getHistory(
      orderId,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
