import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '../../generated/prisma';
import { Roles } from '../auth/decorator/roles.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import {
  CreatePaymentDto,
  PaymentQueryDto,
  UpdatePaymentDto,
} from './dto/payment.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  async findAll(@Query() query: PaymentQueryDto) {
    return this.paymentService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.paymentService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.EDITOR)
  async create(@Body() dto: CreatePaymentDto) {
    return this.paymentService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.EDITOR)
  async update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.paymentService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.EDITOR)
  async remove(@Param('id') id: string) {
    return this.paymentService.remove(id);
  }
}
