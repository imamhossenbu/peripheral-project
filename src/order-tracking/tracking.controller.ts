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

import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Role } from '../../generated/prisma';
import { OrderTrackingService } from './tracking.service';
import { TrackingHistoryQueryDto } from './dto/tracking.dto';

type AuthRequest = Request & { user: { userId: string; role: Role } };

@Controller('orders/:orderId/tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderTrackingController {
  constructor(private trackingService: OrderTrackingService) {}

  private async assertCanView(orderId: string, req: AuthRequest) {
    if (req.user.role === Role.STUDENT) {
      const owns = await this.trackingService.verifyOwnership(
        orderId,
        req.user.userId,
      );
      if (!owns) {
        throw new ForbiddenException(
          'You can only view your own order tracking',
        );
      }
    }
  }

  // Initial page load e full history (path draw korar jonno)
  @Get()
  async getHistory(
    @Param('orderId') orderId: string,
    @Req() req: AuthRequest,
    @Query() query: TrackingHistoryQueryDto,
  ) {
    await this.assertCanView(orderId, req);
    return this.trackingService.getHistory(orderId, query.limit);
  }

  // Shudhu shobceye notun location ta
  @Get('current')
  async getCurrent(@Param('orderId') orderId: string, @Req() req: AuthRequest) {
    await this.assertCanView(orderId, req);
    return this.trackingService.getCurrentLocation(orderId);
  }
}
