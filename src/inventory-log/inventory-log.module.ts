import { Module } from '@nestjs/common';
import { InventoryLogService } from './inventory-log.service';
import { InventoryLogController } from './inventory-log.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryLogController],
  providers: [InventoryLogService],
  exports: [InventoryLogService],
})
export class InventoryLogModule {}
