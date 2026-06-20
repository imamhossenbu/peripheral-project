import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { InventoryLogService } from './inventory-log.service';
import { CreateManualLogDto, LogQueryDto } from './dto/inventory-log.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';

@Controller('inventory-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.EDITOR)
export class InventoryLogController {
  constructor(private readonly logService: InventoryLogService) {}

  // find all inventory logs for admin panel
  @Get()
  async findAll(@Query() query: LogQueryDto) {
    return this.logService.findAll(query);
  }

  // create manual log for admin panel
  @Post()
  async createManualLog(@Body() dto: CreateManualLogDto) {
    return this.logService.createManualLog(dto);
  }
}
