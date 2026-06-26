// device-chat.module.ts
import { Module } from '@nestjs/common';
import { DeviceChatController } from './device-chat.controller';
import { DeviceChatService } from './device-chat.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DeviceChatController],
  providers: [DeviceChatService],
})
export class DeviceChatModule {}
