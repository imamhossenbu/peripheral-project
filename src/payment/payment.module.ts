import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  imports: [PrismaModule, OrderModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
