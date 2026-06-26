import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FineController } from './fine.controller';
import { FineService } from './fine.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [FineController],
  providers: [FineService],
  exports: [FineService],
})
export class FineModule {}
