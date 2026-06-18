// src/cloudinary/cloudinary.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  uploadFile(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      // 'folder' প্রপার্টি যোগ করা ভালো যাতে ইমেজগুলো গুছিয়ে থাকে
      const upload = cloudinary.uploader.upload_stream(
        { folder: 'lms-profiles' },
        (error, result) => {
          if (error) {
            console.error('Cloudinary Error:', error); // এরর কনসোলে চেক করুন
            return reject(error);
          }
          if (!result) return reject(new Error('Upload failed'));
          resolve(result);
        },
      );
      streamifier.createReadStream(file.buffer).pipe(upload);
    });
  }
}
