// borrow-request.module.ts
import { Module } from '@nestjs/common';
import { BorrowRequestController } from './borrow-request.controller';
import { BorrowRequestService } from './borrow-request.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FineModule } from '../fine/fine.module';

@Module({
  imports: [PrismaModule,FineModule],
  controllers: [BorrowRequestController],
  providers: [BorrowRequestService],
})
export class BorrowRequestModule {}
