import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { FineStatus } from '../../../generated/prisma';

// Admin manually fine create korte chaile (auto-create er baire, special case)
export class CreateFineDto {
  @IsString()
  @IsNotEmpty()
  borrowRequestId!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class WaiveFineDto {
  @IsString()
  @IsNotEmpty()
  waivedReason!: string;
}

export class PayFineDto {
  // empty body-o thik ase, just status update kortei call hobe
  @IsOptional()
  @IsString()
  notes?: string;
}

export class FineQueryDto {
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
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(FineStatus)
  status?: FineStatus;
}