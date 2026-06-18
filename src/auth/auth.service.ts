import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterDto, LoginDto, UpdateProfileDto } from './dto/auth.dto';
import { MailService } from './mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const hash = await bcrypt.hash(dto.password, 10);
    const token = crypto.randomBytes(32).toString('hex');

    const user = await this.prisma.user.create({
      data: { ...dto, password: hash, verificationToken: token },
    });

    await this.mailService.sendVerificationEmail(user.email, token);
    return { message: 'Registration successful. Please verify your email.' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isVerified) throw new UnauthorizedException('Email not verified');

    const token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { access_token: token };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });
    if (!user) throw new BadRequestException('Invalid token');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationToken: null },
    });
    return { message: 'Email verified successfully' };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: token },
    });

    await this.mailService.sendResetPasswordEmail(email, token);
    return { message: 'Reset link sent to your email' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });
    if (!user) throw new BadRequestException('Invalid token');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hash, verificationToken: null },
    });
    return { message: 'Password updated successfully' };
  }

  async changePassword(userId: string, oldPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(oldPass, user.password)))
      throw new UnauthorizedException('Wrong password');

    const hash = await bcrypt.hash(newPass, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });
    return { message: 'Password changed successfully' };
  }
}
