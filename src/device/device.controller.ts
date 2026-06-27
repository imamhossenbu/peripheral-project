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
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

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

  // ================= CREATE =================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'file',
        maxCount: 1,
      },
      {
        name: 'files',
        maxCount: 20,
      },
    ]),
  )
  async create(
    @Body() dto: CreateDeviceDto,
    @UploadedFiles()
    files: {
      file?: Express.Multer.File[];
      files?: Express.Multer.File[];
    },
  ) {
    // Primary Image
    if (files.file?.length) {
      const uploaded = await this.cloudinaryService.uploadFile(files.file[0]);
      dto.imageUrl = uploaded.secure_url;
    }

    // Additional Images
    if (files.files?.length) {
      const uploadedImages = await this.cloudinaryService.uploadFiles(
        files.files,
      );

      dto.images = uploadedImages.map((img, index) => ({
        url: img.secure_url,
        isPrimary: false,
        order: index,
      }));
    }

    return this.deviceService.create(dto);
  }

  // ================= UPDATE =================

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'file',
        maxCount: 1,
      },
      {
        name: 'files',
        maxCount: 20,
      },
    ]),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
    @UploadedFiles()
    files: {
      file?: Express.Multer.File[];
      files?: Express.Multer.File[];
    },
  ) {
    // Primary Image
    if (files.file?.length) {
      const uploaded = await this.cloudinaryService.uploadFile(files.file[0]);
      dto.imageUrl = uploaded.secure_url;
    }

    // Additional Images
    if (files.files?.length) {
      const uploadedImages = await this.cloudinaryService.uploadFiles(
        files.files,
      );

      dto.newImages = uploadedImages.map((img, index) => ({
        url: img.secure_url,
        isPrimary: false,
        order: index,
      }));
    }

    return this.deviceService.update(id, dto);
  }

  // ================= DELETE =================

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  async remove(@Param('id') id: string) {
    return this.deviceService.remove(id);
  }
}
