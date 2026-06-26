import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DeviceService } from './device.service';
import {
  CreateDeviceDto,
  UpdateDeviceDto,
  DeviceQueryDto,
} from './dto/device.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Controller('devices')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get()
  async findAll(@Query() query: DeviceQueryDto) {
    return this.deviceService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.deviceService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Body() dto: CreateDeviceDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      const uploadResult = await this.cloudinaryService.uploadFile(file);
      dto.imageUrl = uploadResult.secure_url;
    }
    return this.deviceService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      const uploadResult = await this.cloudinaryService.uploadFile(file);
      dto.imageUrl = uploadResult.secure_url;
    }
    return this.deviceService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  async remove(@Param('id') id: string) {
    return this.deviceService.remove(id);
  }
}
