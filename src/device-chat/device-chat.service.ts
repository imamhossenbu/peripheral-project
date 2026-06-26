// device-chat.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceChatDto } from './dto/device-chat.dto';

@Injectable()
export class DeviceChatService {
  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(private prisma: PrismaService) {}

  async chat(userId: string, dto: DeviceChatDto) {
    // Device এর পুরো data আনো
    const device = await this.prisma.device.findUnique({
      where: { id: dto.deviceId },
      include: { category: true },
    });

    if (!device) {
      throw new NotFoundException(`Device with ID ${dto.deviceId} not found`);
    }

    // Device data কে context বানাও
    const deviceContext = `
You are a helpful lab assistant for a university peripheral inventory system.
A student is asking about the following device:

Name: ${device.name}
Brand: ${device.brand}
Model: ${device.model}
Category: ${device.category.name}
Status: ${device.status}
Stock Available: ${device.stock}
Description: ${device.description}
Working Principle: ${device.workingPrinciple}
Specifications: ${JSON.stringify(device.specifications, null, 2)}
Purchase Date: ${device.purchaseDate.toDateString()}
Warranty Expiry: ${device.warrantyExpiry.toDateString()}

Answer the student's questions about this device clearly and helpfully.
If they ask about borrowing, remind them they can submit a borrow request through the system.
If stock is 0, let them know it's currently unavailable.
Only answer questions related to this device and its usage.
`.trim();

    // Conversation history build করো
    const messages: Anthropic.MessageParam[] = [
      ...(dto.history || []).map((h) => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: dto.message },
    ];

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: deviceContext,
      messages,
    });

    const reply =
      response.content[0].type === 'text' ? response.content[0].text : '';

    return {
      reply,
      deviceId: dto.deviceId,
    };
  }
}
