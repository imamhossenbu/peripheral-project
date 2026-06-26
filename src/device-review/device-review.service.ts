import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BorrowStatus, ReviewStatus, Role } from '../../generated/prisma';
import {
  CreateDeviceReviewDto,
  DeviceReviewQueryDto,
  ModerateDeviceReviewDto,
  UpdateDeviceReviewDto,
} from './dto/device-review.dto';

@Injectable()
export class DeviceReviewService {
  constructor(private prisma: PrismaService) {}

  // Student: review create korbe — shudhu RETURNED status er nijer borrow request er jonno
  async create(userId: string, dto: CreateDeviceReviewDto) {
    const borrowRequest = await this.prisma.borrowRequest.findUnique({
      where: { id: dto.borrowRequestId },
    });

    if (!borrowRequest) {
      throw new NotFoundException(
        `Borrow request with ID ${dto.borrowRequestId} not found`,
      );
    }

    if (borrowRequest.userId !== userId) {
      throw new ForbiddenException(
        'You can only review devices from your own borrow requests',
      );
    }

    if (borrowRequest.status !== BorrowStatus.RETURNED) {
      throw new BadRequestException(
        'You can only review a device after it has been returned',
      );
    }

    const existing = await this.prisma.deviceReview.findUnique({
      where: { borrowRequestId: dto.borrowRequestId },
    });
    if (existing) {
      throw new BadRequestException(
        'You have already submitted a review for this borrow request',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.deviceReview.create({
        data: {
          deviceId: borrowRequest.deviceId,
          userId,
          borrowRequestId: dto.borrowRequestId,
          rating: dto.rating,
          comment: dto.comment,
          status: ReviewStatus.PENDING,
        },
        include: {
          device: { select: { id: true, name: true } },
        },
      });

      // Admin দের notification — moderation এর জন্য
      const admins = await tx.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      });
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            message: `A new review for "${review.device.name}" is awaiting moderation.`,
            type: 'REVIEW_PENDING',
          })),
        });
      }

      return review;
    });
  }

  // Public/student facing: shudhu APPROVED review dekhabe (kono filter chaileo
  // status:APPROVED e lock kora, override korte parbe na)
  async findApprovedForDevice(deviceId: string, query: DeviceReviewQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = { deviceId, status: ReviewStatus.APPROVED };

    const [total, reviews, ratingAgg] = await Promise.all([
      this.prisma.deviceReview.count({ where }),
      this.prisma.deviceReview.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deviceReview.aggregate({
        where,
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    return {
      data: reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      averageRating: ratingAgg._avg.rating
        ? Number(ratingAgg._avg.rating.toFixed(2))
        : null,
      totalApproved: ratingAgg._count._all,
    };
  }

  // Admin: sob review dekhbe (status filter shoho, PENDING moderation queue er jonno)
  async findAll(query: DeviceReviewQueryDto) {
    const { page, limit, deviceId, userId, status } = query;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (deviceId) where.deviceId = deviceId;
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const [total, reviews] = await Promise.all([
      this.prisma.deviceReview.count({ where }),
      this.prisma.deviceReview.findMany({
        where,
        skip,
        take: limit,
        include: {
          device: { select: { id: true, name: true } },
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Student: nijer shob review dekhbe (status nirbishese)
  async findMyReviews(userId: string, query: DeviceReviewQueryDto) {
    return this.findAll({ ...query, userId });
  }

  async findOne(id: string) {
    const review = await this.prisma.deviceReview.findUnique({
      where: { id },
      include: {
        device: { select: { id: true, name: true } },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return review;
  }

  // Student: nijer review edit korbe — shudhu PENDING thakte (admin already
  // approve/reject korle edit allow na, karon moderation decision invalidate hoye jabe)
  async update(userId: string, id: string, dto: UpdateDeviceReviewDto) {
    const review = await this.prisma.deviceReview.findUnique({
      where: { id },
    });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('You can only edit your own review');
    }
    if (review.status !== ReviewStatus.PENDING) {
      throw new BadRequestException(
        `Review is already ${review.status.toLowerCase()} and can no longer be edited`,
      );
    }

    return this.prisma.deviceReview.update({
      where: { id },
      data: {
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  }

  // Student: nijer review delete korte parbe (kono status e)
  // Admin: jekono review delete korte parbe (moderation cleanup)
  async remove(requesterId: string, requesterRole: Role, id: string) {
    const review = await this.prisma.deviceReview.findUnique({
      where: { id },
    });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    if (requesterRole === Role.STUDENT && review.userId !== requesterId) {
      throw new ForbiddenException('You can only delete your own review');
    }

    const deleted = await this.prisma.deviceReview.delete({ where: { id } });
    return { message: 'Review deleted successfully', id: deleted.id };
  }

  // Admin: review approve/reject korbe
  async moderate(id: string, dto: ModerateDeviceReviewDto) {
    const review = await this.prisma.deviceReview.findUnique({
      where: { id },
    });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    if (review.status !== ReviewStatus.PENDING) {
      throw new BadRequestException(
        `Review is already ${review.status.toLowerCase()}, cannot moderate again`,
      );
    }
    if (
      dto.status !== ReviewStatus.APPROVED &&
      dto.status !== ReviewStatus.REJECTED
    ) {
      throw new BadRequestException('Status must be APPROVED or REJECTED');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deviceReview.update({
        where: { id },
        data: { status: dto.status },
      });

      const statusText =
        dto.status === ReviewStatus.APPROVED ? 'approved' : 'rejected';
      const noteText = dto.adminNote ? ` Note: ${dto.adminNote}` : '';

      await tx.notification.create({
        data: {
          userId: review.userId,
          message: `Your review has been ${statusText}.${noteText}`,
          type:
            dto.status === ReviewStatus.APPROVED
              ? 'REVIEW_APPROVED'
              : 'REVIEW_REJECTED',
        },
      });

      return updated;
    });
  }
}
