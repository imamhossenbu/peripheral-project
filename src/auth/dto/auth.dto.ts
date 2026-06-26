// import {
//   IsEmail,
//   IsString,
//   MinLength,
//   IsOptional,
//   IsUrl,
// } from 'class-validator';

// export class RegisterDto {
//   @IsEmail() email!: string;
//   @MinLength(6) password!: string;
//   @IsOptional() @IsString() firstName?: string;
//   @IsOptional() @IsString() lastName?: string;
//   @IsOptional() @IsString() department?: string;
//   @IsOptional() @IsUrl() imageUrl?: string;
// }

// export class LoginDto {
//   @IsEmail() email!: string;
//   @IsString() password!: string;
// }

// export class UpdateProfileDto {
//   @IsOptional() @IsString() firstName?: string;
//   @IsOptional() @IsString() lastName?: string;
//   @IsOptional() @IsString() department?: string;
//   @IsOptional() @IsUrl() imageUrl?: string;
// }

import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsUrl,
  IsEnum,
} from 'class-validator';
import { Role } from '../../../generated/prisma';

export class RegisterDto {
  @IsEmail() email!: string;
  @MinLength(6) password!: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  // Role register এর সময় নেওয়া হবে না — default STUDENT
  // ADMIN/STAFF শুধু existing ADMIN তৈরি করতে পারবে (আলাদা endpoint)
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
}

// Admin যখন STAFF বা অন্য ADMIN তৈরি করবে
export class CreateUserByAdminDto {
  @IsEmail() email!: string;
  @MinLength(6) password!: string;
  @IsEnum(Role) role!: Role; // ADMIN, STAFF, STUDENT
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() department?: string;
}

export class ChangePasswordDto {
  @IsString() oldPassword!: string;
  @MinLength(6) newPassword!: string;
}

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @MinLength(6) password!: string;
}
