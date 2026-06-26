import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { DeviceReviewService } from './device-review.service';
import {
  CreateDeviceReviewDto,
  DeviceReviewQueryDto,
  ModerateDeviceReviewDto,
  UpdateDeviceReviewDto,
} from './dto/device-review.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';

type AuthRequest = Request & { user: { userId: string; role: Role } };

@Controller('reviews')
export class DeviceReviewController {
  constructor(private readonly deviceReviewService: DeviceReviewService) {}

  // Public: কোনো device-এর approved review গুলো দেখাবে (login লাগবে না)
  @Get('device/:deviceId')
  async findApprovedForDevice(
    @Param('deviceId') deviceId: string,
    @Query() query: DeviceReviewQueryDto,
  ) {
    return this.deviceReviewService.findApprovedForDevice(deviceId, query);
  }

  // Student: নিজের সব review দেখবে (status নির্বিশেষে)
  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getMyReviews(
    @Req() req: AuthRequest,
    @Query() query: DeviceReviewQueryDto,
  ) {
    return this.deviceReviewService.findMyReviews(req.user.userId, query);
  }

  // Admin: সব review দেখবে, moderation queue (status=PENDING filter দিয়ে)
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  async findAll(@Query() query: DeviceReviewQueryDto) {
    return this.deviceReviewService.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async findOne(@Param('id') id: string) {
    return this.deviceReviewService.findOne(id);
  }

  // Student: review submit করবে — শুধু RETURNED borrow request এর জন্য (service এ check হয়)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.STUDENT)
  async create(@Req() req: AuthRequest, @Body() dto: CreateDeviceReviewDto) {
    return this.deviceReviewService.create(req.user.userId, dto);
  }

  // Student: নিজের PENDING review edit করবে
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceReviewDto,
  ) {
    return this.deviceReviewService.update(req.user.userId, id, dto);
  }

  // Admin: approve/reject করবে
  @Patch(':id/moderate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  async moderate(
    @Param('id') id: string,
    @Body() dto: ModerateDeviceReviewDto,
  ) {
    return this.deviceReviewService.moderate(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.deviceReviewService.remove(req.user.userId, req.user.role, id);
  }
}
