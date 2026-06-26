// device-chat.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import Groq from 'groq-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceChatDto } from './dto/device-chat.dto';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

@Injectable()
export class DeviceChatService {
  private groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  constructor(private prisma: PrismaService) {}

  async chat(userId: string, dto: DeviceChatDto) {
    // Device এর পুরো data আনো (variants সহ, কারণ stock variant এ থাকে)
    const device = await this.prisma.device.findUnique({
      where: { id: dto.deviceId },
      include: { category: true, variants: true },
    });

    if (!device) {
      throw new NotFoundException(`Device with ID ${dto.deviceId} not found`);
    }

    // Variant গুলো থেকে stock summary বানাও (Device নিজে stock রাখে না)
    const totalStock = device.variants.reduce((sum, v) => sum + v.stock, 0);
    const stockSummary =
      device.variants.length > 0
        ? device.variants
            .map((v) => `- ${v.name}: ${v.stock} unit(s) available`)
            .join('\n')
        : 'No variants configured for this device.';

    // Device data কে context বানাও
    const deviceContext = `
You are a helpful lab assistant for a university peripheral inventory system.
A student is asking about the following device:

Name: ${device.name}
Brand: ${device.brand}
Model: ${device.model}
Category: ${device.category?.name ?? 'Uncategorized'}
Status: ${device.status}
Total Stock Across Variants: ${totalStock}
Variant Breakdown:
${stockSummary}
Description: ${device.description}
Working Principle: ${device.workingPrinciple}
Specifications: ${JSON.stringify(device.specifications, null, 2)}
Purchase Date: ${device.purchaseDate.toDateString()}
Warranty Expiry: ${device.warrantyExpiry.toDateString()}

Answer the student's questions about this device clearly and helpfully.
If they ask about borrowing, remind them they can submit a borrow request through the system.
If a variant's stock is 0, let them know that specific variant is currently unavailable.
If total stock is 0, let them know the device is currently unavailable in all variants.
Only answer questions related to this device and its usage.
`.trim();

    // Conversation history build করো
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: deviceContext },
      ...(dto.history || []).map((h) => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: dto.message },
    ];

    const completion = await this.groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      max_completion_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content ?? '';

    return {
      reply,
      deviceId: dto.deviceId,
    };
  }
}
