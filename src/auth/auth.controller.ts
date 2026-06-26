import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Patch,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  InternalServerErrorException,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  CreateUserByAdminDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { RolesGuard } from './guard/roles.guard';
import { Roles } from './decorator/roles.decorator';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Role } from '../../generated/prisma';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: Role };
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private cloudinaryService: CloudinaryService,
  ) {}

  // ─── PUBLIC ─────────────────────────────────────────────────

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('verify')
  verify(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Query('token') token: string, @Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(token, dto.password);
  }

  // ─── PROTECTED (যেকোনো logged-in user) ─────────────────────

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @UseInterceptors(FileInterceptor('file'))
  async updateProfile(
    @Req() req: AuthRequest,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      let imageUrl = dto.imageUrl;
      if (file) {
        const uploadResult = await this.cloudinaryService.uploadFile(file);
        imageUrl = uploadResult.secure_url;
      }
      return await this.authService.updateProfile(req.user.userId, {
        ...dto,
        imageUrl,
      });
    } catch (error) {
      console.error('Profile Update Failed:', error);
      throw new InternalServerErrorException(
        'Image upload or profile update failed',
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@Req() req: AuthRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.userId, dto);
  }

  // ─── ADMIN ONLY ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('users')
  createUser(@Req() req: AuthRequest, @Body() dto: CreateUserByAdminDto) {
    return this.authService.createUserByAdmin(dto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('users/:id/role')
  updateRole(
    @Req() req: AuthRequest,
    @Param('id') targetId: string,
    @Body('role') role: Role,
  ) {
    return this.authService.updateUserRole(targetId, role, req.user.userId);
  }
}
