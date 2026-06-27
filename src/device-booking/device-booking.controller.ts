import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { DeviceBookingService } from './device-booking.service';
import {
  BookingQueryDto,
  CreateSystemBlockDto,
} from './dto/device-booking.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';

@Controller('device-bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeviceBookingController {
  constructor(private readonly deviceBookingService: DeviceBookingService) {}

  // Admin/Staff: সব বুকড টাইম-লাইন এবং শিডিউল দেখতে পারবে
  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  async findAll(@Query() query: BookingQueryDto) {
    return this.deviceBookingService.findAll(query);
  }

  // Admin: ম্যানুয়ালি কোনো ডিভাইস ব্লক করতে চাইলে
  @Post('system-block')
  @Roles(Role.ADMIN)
  async createSystemBlock(@Body() dto: CreateSystemBlockDto) {
    return this.deviceBookingService.createSystemBlock(dto);
  }
}
