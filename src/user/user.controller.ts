import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: Role };
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ─── যেকোনো logged-in user নিজের profile দেখতে পারবে ──────
  @Get('me')
  getProfile(@Req() req: AuthRequest) {
    return this.userService.findOne(req.user.userId);
  }

  // ─── ADMIN: সব user list ────────────────────────────────────
  @Get()
  @Roles(Role.ADMIN)
  findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }

  // ─── ADMIN: যেকোনো user এর profile ────────────────────────
  // NOTE: 'me' এর পরে এই route, নাহলে 'me' কে id হিসেবে নেবে
  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  // ─── ADMIN: নতুন user তৈরি ──────────────────────────────────
  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  // ─── ADMIN: user update ─────────────────────────────────────
  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    // Admin নিজের role নিজে change করতে পারবে না
    if (id === req.user.userId && dto.role && dto.role !== req.user.role) {
      throw new ForbiddenException('You cannot change your own role');
    }
    return this.userService.update(id, dto);
  }

  // ─── ADMIN: user delete ─────────────────────────────────────
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    // Admin নিজেকে delete করতে পারবে না
    if (id === req.user.userId) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    return this.userService.remove(id);
  }
}
