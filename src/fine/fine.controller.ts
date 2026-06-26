import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { FineService } from './fine.service';
import {
  CreateFineDto,
  FineQueryDto,
  PayFineDto,
  WaiveFineDto,
} from './dto/fine.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';

type AuthRequest = Request & { user: { userId: string; role: Role } };

@Controller('fines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FineController {
  constructor(private readonly fineService: FineService) {}

  // Student: নিজের fines দেখবে
  @Get('my')
  async getMyFines(@Req() req: AuthRequest, @Query() query: FineQueryDto) {
    return this.fineService.findMyFines(req.user.userId, query);
  }

  // Admin: সব fines দেখবে, filter করতে পারবে
  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  async findAll(@Query() query: FineQueryDto) {
    return this.fineService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthRequest) {
    const fine = await this.fineService.findOne(id);

    if (req.user.role === Role.STUDENT && fine.userId !== req.user.userId) {
      throw new ForbiddenException('You can only access your own fines');
    }

    return fine;
  }

  // Admin: special case e manually fine create
  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  async create(@Body() dto: CreateFineDto) {
    return this.fineService.create(dto);
  }

  // Student/Admin: fine pay mark korbe (student shudhu nijer fine pay korte parbe)
  @Patch(':id/pay')
  async pay(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() dto: PayFineDto,
  ) {
    if (req.user.role === Role.STUDENT) {
      const fine = await this.fineService.findOne(id);
      if (fine.userId !== req.user.userId) {
        throw new ForbiddenException('You can only pay your own fines');
      }
    }
    return this.fineService.pay(id, dto);
  }

  // Admin: fine waive korbe
  @Patch(':id/waive')
  @Roles(Role.ADMIN)
  async waive(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() dto: WaiveFineDto,
  ) {
    return this.fineService.waive(id, req.user.userId, dto);
  }
}
