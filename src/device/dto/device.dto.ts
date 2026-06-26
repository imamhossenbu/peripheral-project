import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsObject,
  IsDateString,
  IsInt,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsUrl,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Status } from '../../../generated/prisma';

// ─── VARIANT DTO ──────────────────────────────────────────

export class CreateDeviceVariantDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  })
  @IsObject()
  specifications?: any;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeviceVariantDto {
  @IsOptional()
  @IsString()
  id?: string; // existing variant update করতে id দিতে হবে

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  })
  @IsObject()
  specifications?: any;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── DEVICE IMAGE DTO ─────────────────────────────────────

export class DeviceImageDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

// ─── CREATE DEVICE DTO ────────────────────────────────────

export class CreateDeviceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  brand!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsString()
  @IsNotEmpty()
  serialNumber!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  })
  @IsObject()
  specifications!: any;

  @IsString()
  @IsNotEmpty()
  workingPrinciple!: string;

  @IsDateString()
  purchaseDate!: string;

  @IsDateString()
  warrantyExpiry!: string;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  // imageUrl — primary image (Cloudinary upload থেকে আসবে)
  @IsOptional()
  @IsString()
  imageUrl?: string;

  // qrCodeUrl — QR generate হলে set হবে (সাধারণত service-এ set হয়)
  @IsOptional()
  @IsString()
  qrCodeUrl?: string;

  // Multiple images — JSON string হিসেবে আসতে পারে (multipart form এর জন্য)
  @IsOptional()
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return [];
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceImageDto)
  images?: DeviceImageDto[];

  // Variants — JSON string হিসেবে আসতে পারে
  @IsOptional()
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return [];
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDeviceVariantDto)
  variants?: CreateDeviceVariantDto[];
}

// ─── UPDATE DEVICE DTO ────────────────────────────────────

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  brand?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  serialNumber?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  })
  @IsObject()
  specifications?: any;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  workingPrinciple?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsDateString()
  warrantyExpiry?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  qrCodeUrl?: string;

  // Upsert variants — id থাকলে update, না থাকলে create
  @IsOptional()
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return [];
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateDeviceVariantDto)
  variants?: UpdateDeviceVariantDto[];

  // নতুন images add করতে (existing গুলো replace হবে না)
  @IsOptional()
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return [];
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceImageDto)
  newImages?: DeviceImageDto[];

  // Image IDs যেগুলো delete করতে হবে
  @IsOptional()
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return [];
    }
  })
  @IsArray()
  @IsString({ each: true })
  deleteImageIds?: string[];
}

// ─── QUERY DTO ────────────────────────────────────────────

export class DeviceQueryDto {
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
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  maxPrice?: number;
}
