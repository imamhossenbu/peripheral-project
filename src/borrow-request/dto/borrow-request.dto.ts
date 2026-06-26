// dto/borrow-request.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BorrowStatus } from '../../../generated/prisma';

export class CreateBorrowRequestDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ReviewBorrowRequestDto {
  @IsEnum(BorrowStatus)
  status!: BorrowStatus; // APPROVED or REJECTED

  @IsOptional()
  @IsString()
  adminNote?: string;
}

export class BorrowRequestQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit: number = 10;

  @IsOptional()
  @IsEnum(BorrowStatus)
  status?: BorrowStatus;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
