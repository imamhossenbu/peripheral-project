import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingQueryDto,
  CreateSystemBlockDto,
} from './dto/device-booking.dto';

@Injectable()
export class DeviceBookingService {
  constructor(private readonly prisma: PrismaService) {}

  // সব বুকিং শিডিউল দেখবে (Admin Dashboard-এর জন্য)
  async findAll(query: BookingQueryDto) {
    const { page, limit, deviceId, userId } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (deviceId) where.deviceId = deviceId;
    if (userId) where.userId = userId;

    const [total, bookings] = await Promise.all([
      this.prisma.deviceBooking.count({ where }),
      this.prisma.deviceBooking.findMany({
        where,
        skip,
        take: limit,
        include: {
          device: {
            select: { id: true, name: true },
          },
          variant: {
            select: { id: true, name: true },
          },
          // যেহেতু userId রিলেশন প্রিজমাতে অপশনাল বা নেই, তাই ইউজার ডিটেইলস অবজেক্ট ম্যাপ করা হচ্ছে
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Prisma-তে সরাসরি User রিলেশন না থাকলে ডাটা অ্যাটাচ করার ট্রিক
    const enrichedBookings = await Promise.all(
      bookings.map(async (booking) => {
        if (!booking.userId) return { ...booking, user: null };
        const user = await this.prisma.user.findUnique({
          where: { id: booking.userId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
        return { ...booking, user };
      }),
    );

    return {
      data: enrichedBookings,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // সিস্টেম মেইনটেইন্যান্স বা বিশেষ প্রয়োজনে এডমিন নিজে ডিভাইস লক/ব্লক করতে চাইলে
  async createSystemBlock(dto: CreateSystemBlockDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (start >= end) {
      throw new BadRequestException('End date must be after start date');
    }

    return this.prisma.deviceBooking.create({
      data: {
        deviceId: dto.deviceId,
        variantId: dto.variantId || null,
        userId: null, // null মানেই সিস্টেম বা এডমিন লক
        startDate: start,
        endDate: end,
        note: dto.note || 'System Maintenance Block',
      },
    });
  }
}
