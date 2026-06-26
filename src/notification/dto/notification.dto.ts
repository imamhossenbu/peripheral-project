import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Notification type গুলো এখানে define করা — schema String হলেও
// application level এ enforce করা ভালো
export const NOTIFICATION_TYPES = [
  'INFO',
  'SUCCESS',
  'WARNING',
  'ERROR',
  'BORROW_REQUEST',
  'BORROW_APPROVED',
  'BORROW_REJECTED',
  'BORROW_RETURNED',
  'BORROW_EXTENSION',
  'FINE_ISSUED',
  'FINE_WAIVED',
  'ORDER_UPDATE',
  'PAYMENT_SUCCESS',
  'SYSTEM',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string; // specific userId অথবা "ALL"

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsIn(NOTIFICATION_TYPES)
  type!: NotificationType;
}

export class NotificationQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit: number = 20;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: NotificationType;
}
