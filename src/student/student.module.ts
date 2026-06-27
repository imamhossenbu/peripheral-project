import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StudentDashboardController } from './student.controller';
import { StudentDashboardService } from './student.service';

@Module({
  imports: [PrismaModule, OrderModule],
  controllers: [StudentDashboardController],
  providers: [StudentDashboardService],
  exports: [StudentDashboardService],
})
export class StudentDashboardModule {}
