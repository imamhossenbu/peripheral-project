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
import { OrderService } from '../order/order.service';
import {
  CreatePaymentDto,
  InitSslCommerzPaymentDto,
  PaymentQueryDto,
  UpdatePaymentDto,
} from './dto/payment.dto';
import { PaymentService } from './payment.service';

type AuthRequest = Request & {
  user: { userId: string; role: Role };
};

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly orderService: OrderService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async findAll(@Query() query: PaymentQueryDto, @Req() req: AuthRequest) {
    if (req.user.role === Role.STUDENT) {
      query.userId = req.user.userId;
    }

    return this.paymentService.findAll(query);
  }

  @Post('sslcommerz/initiate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.STUDENT)
  async initiateSslCommerz(
    @Body() dto: InitSslCommerzPaymentDto,
    @Req() req: AuthRequest,
  ) {
    if (req.user.role === Role.STUDENT) {
      const order = await this.orderService.findOne(dto.orderId);
      if (order.userId !== req.user.userId) {
        throw new ForbiddenException('You can only pay for your own orders');
      }
    }

    return this.paymentService.createSslCommerzSession(dto.orderId);
  }

  @Post('sslcommerz/success')
  async sslCommerzSuccess(@Body() payload: any, @Res() res: Response) {
    try {
      await this.paymentService.handleSslCommerzCallback('success', payload);
      return res.redirect(
        this.paymentService.getSslCommerzRedirectUrl('success'),
      );
    } catch (err: any) {
      console.error('SSLCommerz success error:', err?.message, payload);
      return res.redirect(this.paymentService.getSslCommerzRedirectUrl('fail'));
    }
  }

  @Post('sslcommerz/fail')
  async sslCommerzFail(@Body() payload: any, @Res() res: Response) {
    try {
      await this.paymentService.handleSslCommerzCallback('fail', payload);
    } catch (err: any) {
      console.error('SSLCommerz fail error:', err?.message);
    }
    return res.redirect(this.paymentService.getSslCommerzRedirectUrl('fail'));
  }

  @Post('sslcommerz/cancel')
  async sslCommerzCancel(@Body() payload: any, @Res() res: Response) {
    try {
      await this.paymentService.handleSslCommerzCallback('cancel', payload);
    } catch (err: any) {
      console.error('SSLCommerz cancel error:', err?.message);
    }
    return res.redirect(this.paymentService.getSslCommerzRedirectUrl('cancel'));
  }

  @Post('sslcommerz/ipn')
  async sslCommerzIpn(@Body() payload: any) {
    return this.paymentService.handleSslCommerzCallback('ipn', payload);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async findOne(@Param('id') id: string, @Req() req: AuthRequest) {
    const payment = await this.paymentService.findOne(id);

    if (req.user.role === Role.STUDENT && payment.userId !== req.user.userId) {
      throw new ForbiddenException('You can only access your own payments');
    }

    return payment;
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.STUDENT)
  async create(@Body() dto: CreatePaymentDto, @Req() req: AuthRequest) {
    if (req.user.role === Role.STUDENT) {
      const order = await this.orderService.findOne(dto.orderId);
      if (order.userId !== req.user.userId) {
        throw new ForbiddenException('You can only pay for your own orders');
      }
      dto.userId = req.user.userId;
    }

    return this.paymentService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  async update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.paymentService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  async remove(@Param('id') id: string) {
    return this.paymentService.remove(id);
  }
}
