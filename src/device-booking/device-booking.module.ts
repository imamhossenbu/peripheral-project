import { Module } from '@nestjs/common';
import { DeviceBookingService } from './device-booking.service';
import { DeviceBookingController } from './device-booking.controller';
import { PrismaModule } from '../prisma/prisma.module'; // আপনার প্রিজমা মডিউল পাথ চেক করে নিবেন

@Module({
  imports: [PrismaModule],
  controllers: [DeviceBookingController],
  providers: [DeviceBookingService],
  exports: [DeviceBookingService], // অন্য কোনো মডিউল (যেমন Borrow মডিউল) যদি এটি ব্যবহার করতে চায়
})
export class DeviceBookingModule {}
