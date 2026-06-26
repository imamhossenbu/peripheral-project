// order-tracking.module.ts
//
// NOTE: AppModule e JwtModule.register({ global: true, ... }) kora ase,
// tai JwtService ekhane direct inject kora jabe — AuthModule import
// korar dorkar nei.

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WsJwtAuthGuard } from '../auth/guard/ws-jwt-auth.guard';
import { OrderTrackingController } from './tracking.controller';
import { OrderTrackingGateway } from './tracking.gateway';
import { OrderTrackingService } from './tracking.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrderTrackingController],
  providers: [OrderTrackingGateway, OrderTrackingService, WsJwtAuthGuard],
})
export class OrderTrackingModule {}
