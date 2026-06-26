// device-chat.controller.ts
import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { DeviceChatService } from './device-chat.service';
import { DeviceChatDto } from './dto/device-chat.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';

@Controller('devices/chat')
@UseGuards(JwtAuthGuard)
export class DeviceChatController {
  constructor(private readonly deviceChatService: DeviceChatService) {}

  @Post()
  async chat(
    @Req() req: Request & { user: { userId: string } },
    @Body() dto: DeviceChatDto,
  ) {
    return this.deviceChatService.chat(req.user.userId, dto);
  }
}
