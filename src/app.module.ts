// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from './auth/mail/mail.module';
import { UserModule } from './user/user.module';
import { CategoryModule } from './category/category.module';
import { DeviceModule } from './device/device.module';
import { InventoryLogModule } from './inventory-log/inventory-log.module';
import { NotificationModule } from './notification/notification.module';
import { AdminModule } from './admin/admin.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BorrowRequestModule } from './borrow-request/borrow-request.module';
import { DeviceChatModule } from './device-chat/device-chat.module';
import { FineModule } from './fine/fine.module';
import { DeviceReviewModule } from './device-review/device-review.module';
import { OrderTrackingModule } from './order-tracking/tracking.module';
import { DeviceBookingModule } from './device-booking/device-booking.module';
import { StudentDashboardModule } from './student/student.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    MailModule,
    UserModule,
    CategoryModule,
    DeviceModule,
    InventoryLogModule,
    NotificationModule,
    AdminModule,
    OrderModule,
    BorrowRequestModule,
    DeviceChatModule,
    FineModule,
    DeviceReviewModule,
    OrderTrackingModule,
    DeviceBookingModule,
    StudentDashboardModule,
    PaymentModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
