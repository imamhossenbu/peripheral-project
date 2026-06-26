// borrow-request.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { BorrowRequestService } from './borrow-request.service';
import {
  CreateBorrowRequestDto,
  ReviewBorrowRequestDto,
  BorrowRequestQueryDto,
} from './dto/borrow-request.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';

@Controller('borrow-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BorrowRequestController {
  constructor(private readonly borrowRequestService: BorrowRequestService) {}

  // Student: নিজের requests দেখবে
  @Get('my')
  async getMyRequests(
    @Req() req: Request & { user: { userId: string } },
    @Query() query: BorrowRequestQueryDto,
  ) {
    return this.borrowRequestService.getMyRequests(req.user.userId, query);
  }

  // Admin: সব requests দেখবে
  @Get()
  @Roles(Role.ADMIN)
  async getAllRequests(@Query() query: BorrowRequestQueryDto) {
    return this.borrowRequestService.getAllRequests(query);
  }

  // Student: নতুন request করবে
  @Post()
  async create(
    @Req() req: Request & { user: { userId: string } },
    @Body() dto: CreateBorrowRequestDto,
  ) {
    return this.borrowRequestService.create(req.user.userId, dto);
  }

  // Admin: approve/reject করবে
  @Patch(':id/review')
  @Roles(Role.ADMIN)
  async review(
    @Req() req: Request & { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: ReviewBorrowRequestDto,
  ) {
    return this.borrowRequestService.review(req.user.userId, id, dto);
  }

  // Student: return করবে
  @Patch(':id/return')
  async returnDevice(
    @Req() req: Request & { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.borrowRequestService.returnDevice(req.user.userId, id);
  }
}
