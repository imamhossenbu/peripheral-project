// order-tracking.module.ts
//
// NOTE: AppModule e JwtModule.register({ global: true, ... }) kora ase,
// tai JwtService ekhane direct inject kora jabe — AuthModule import
// korar dorkar nei.

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';

import { WsJwtAuthGuard } from '../auth/guard/ws-jwt-auth.guard';
import { OrderTrackingGateway } from './tracking.gateway';
import { OrderTrackingService } from './tracking.service';
import { OrderMessageService } from '../order-message/order-message.service';
import { OrderTrackingController } from './tracking.controller';
import { OrderMessageController } from '../order-message/order-message.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OrderTrackingController, OrderMessageController],
  providers: [
    OrderTrackingGateway,
    OrderTrackingService,
    OrderMessageService,
    WsJwtAuthGuard,
  ],
})
export class OrderTrackingModule {}
