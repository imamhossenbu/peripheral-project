// dto/device-chat.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class DeviceChatDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  // conversation history পাঠাবে frontend
  @IsOptional()
  history?: { role: 'user' | 'assistant'; content: string }[];
}
