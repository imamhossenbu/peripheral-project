import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class SendOrderMessageDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
