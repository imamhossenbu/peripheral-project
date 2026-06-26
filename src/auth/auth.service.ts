import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  CreateUserByAdminDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import { MailService } from './mail/mail.service';
import { Role } from '../../generated/prisma';


type SafeUser = Omit<
  Awaited<ReturnType<PrismaService['user']['findUniqueOrThrow']>>,
  | 'password'
  | 'verificationToken'
  | 'resetPasswordToken'
  | 'resetPasswordExpiry'
>;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mailService: MailService,
  ) {}

  private sanitizeUser(user: any): SafeUser {
    const {
      password,
      verificationToken,
      resetPasswordToken,
      resetPasswordExpiry,
      ...safe
    } = user;
    return safe;
  }

  // ─── PUBLIC: Register (সবসময় STUDENT) ─────────────────────
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new BadRequestException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 10);
    const token = crypto.randomBytes(32).toString('hex');

    await this.prisma.user.create({
      data: {
        ...dto,
        password: hash,
        role: Role.STUDENT, // সবসময় STUDENT — hardcoded
        verificationToken: token,
      },
    });

    await this.mailService.sendVerificationEmail(dto.email, token);
    return { message: 'Registration successful. Please verify your email.' };
  }

  // ─── ADMIN: Staff/Admin তৈরি করবে ──────────────────────────
  async createUserByAdmin(dto: CreateUserByAdminDto, adminId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new BadRequestException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 10);
    const token = crypto.randomBytes(32).toString('hex');

    const user = await this.prisma.user.create({
      data: {
        ...dto,
        password: hash,
        verificationToken: token,
        // Admin-created user কে directly verified করা যায়,
        // অথবা mail পাঠিয়ে verify করানো যায় — এখানে mail পাঠাচ্ছি
        isVerified: false,
      },
    });

    await this.mailService.sendVerificationEmail(user.email, token);
    return {
      message: `${dto.role} account created. Verification email sent.`,
      user: this.sanitizeUser(user),
    };
  }

  // ─── PUBLIC: Login ──────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please check your inbox.',
      );
    }

    const token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      access_token: token,
      user: this.sanitizeUser(user),
    };
  }

  // ─── PUBLIC: Email Verify ───────────────────────────────────
  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });
    if (!user) throw new BadRequestException('Invalid or expired token');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationToken: null },
    });
    return { message: 'Email verified successfully' };
  }

  // ─── PROTECTED: Profile Update ──────────────────────────────
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    return this.sanitizeUser(updated); // password hash expose হবে না
  }

  // ─── PUBLIC: Forgot Password ────────────────────────────────
  // verificationToken এর বদলে আলাদা resetPasswordToken ব্যবহার করছি
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Security best practice: user না থাকলেও same message দাও
    // (attacker জানতে পারবে না কোন email registered)
    if (!user) {
      return { message: 'If this email exists, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 ঘণ্টা

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: token,      // ← আলাদা field (schema update দরকার)
        resetPasswordExpiry: expiry,
      },
    });

    await this.mailService.sendResetPasswordEmail(email, token);
    return { message: 'If this email exists, a reset link has been sent.' };
  }

  // ─── PUBLIC: Reset Password ─────────────────────────────────
  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: { gt: new Date() }, // expired হলে reject
      },
    });
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    });

    await this.mailService.sendSecurityAlertEmail(user.email, 'reset');
    return { message: 'Password reset successfully' };
  }

  // ─── PROTECTED: Change Password ─────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(dto.oldPassword, user.password))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    await this.mailService.sendSecurityAlertEmail(user.email, 'changed');
    return { message: 'Password changed successfully' };
  }

  // ─── ADMIN: Role Update ─────────────────────────────────────
  async updateUserRole(targetUserId: string, newRole: Role, adminId: string) {
    if (targetUserId === adminId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) throw new BadRequestException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
    });

    return {
      message: `Role updated to ${newRole}`,
      user: this.sanitizeUser(updated),
    };
  }
}