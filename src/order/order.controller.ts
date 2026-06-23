import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Role } from '../../generated/prisma';
import { Roles } from '../auth/decorator/roles.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { CreateOrderDto, OrderQueryDto, UpdateOrderDto } from './dto/order.dto';
import { OrderService } from './order.service';

type AuthRequest = Request & {
  user: { userId: string; role: Role };
};

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  async findAll(@Query() query: OrderQueryDto, @Req() req: AuthRequest) {
    if (req.user.role === Role.VIEWER) {
      query.userId = req.user.userId;
    }

    return this.orderService.findAll(query);
  }

  @Get(':id/invoice')
  async downloadInvoice(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const order = await this.orderService.findOne(id);

    if (req.user.role === Role.VIEWER && order.userId !== req.user.userId) {
      throw new ForbiddenException('You can only download your own invoices');
    }

    const invoice = await this.orderService.generateInvoicePdf(id);
    const filename = `invoice-${order.orderNumber}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', invoice.length);
    res.send(invoice);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthRequest) {
    const order = await this.orderService.findOne(id);

    if (req.user.role === Role.VIEWER && order.userId !== req.user.userId) {
      throw new ForbiddenException('You can only access your own orders');
    }

    return order;
  }

  @Post()
  @Roles(Role.ADMIN, Role.EDITOR, Role.VIEWER)
  async create(@Body() dto: CreateOrderDto, @Req() req: AuthRequest) {
    if (req.user.role === Role.VIEWER) {
      dto.userId = req.user.userId;
    }

    return this.orderService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.EDITOR)
  async update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.orderService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.EDITOR)
  async remove(@Param('id') id: string) {
    return this.orderService.remove(id);
  }
}
