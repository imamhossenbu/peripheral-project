import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { OrderTrackingStage } from '../../../generated/prisma';

// Staff/admin er phone theke location push korar somoy use hobe
export class PushLocationDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsEnum(OrderTrackingStage)
  stage?: OrderTrackingStage;

  @IsOptional()
  @IsString()
  note?: string;
}

// REST endpoint diye history fetch korar jonno (fallback / initial load)
export class TrackingHistoryQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;
}
