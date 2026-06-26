import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FineStatus } from '../../generated/prisma';
import {
  CreateFineDto,
  FineQueryDto,
  PayFineDto,
  WaiveFineDto,
} from './dto/fine.dto';

const DEFAULT_FINE_PER_DAY = 50;

@Injectable()
export class FineService {
  constructor(private prisma: PrismaService) {}

  private getPerDayRate() {
    const fromEnv = Number(process.env.FINE_PER_DAY_RATE);
    return Number.isFinite(fromEnv) && fromEnv > 0
      ? fromEnv
      : DEFAULT_FINE_PER_DAY;
  }

  // returnDevice() er ভিতর theke call hobe (একই transaction client দিয়ে, tx).
  // endDate পার হয়ে গেলে fine create kore, na hole kichu kore na.
  // BorrowRequest e fine ekta unique relation, tai already thakle dobar create hobe na.
  async createLateFineIfApplicable(
    tx: any,
    params: {
      borrowRequestId: string;
      userId: string;
      endDate: Date;
      returnedAt: Date;
    },
  ) {
    const { borrowRequestId, userId, endDate, returnedAt } = params;

    if (returnedAt <= endDate) {
      return null; // somoy moto return hoyeche, fine lagbe na
    }

    const existing = await tx.fine.findUnique({
      where: { borrowRequestId },
    });
    if (existing) {
      return existing; // already ekta fine ase, dobar banano lagbe na
    }

    const daysLate = Math.ceil(
      (returnedAt.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const amount = daysLate * this.getPerDayRate();

    const fine = await tx.fine.create({
      data: {
        borrowRequestId,
        userId,
        amount,
        reason: `Late return: ${daysLate} day(s) overdue`,
        status: FineStatus.UNPAID,
      },
    });

    await tx.notification.create({
      data: {
        userId,
        message: `A fine of ${amount.toFixed(2)} has been issued for a late return (${daysLate} day(s) overdue).`,
        type: 'FINE_ISSUED',
      },
    });

    return fine;
  }

  // Admin special case e manually fine lagale (auto-create er baire)
  async create(dto: CreateFineDto) {
    const borrowRequest = await this.prisma.borrowRequest.findUnique({
      where: { id: dto.borrowRequestId },
    });
    if (!borrowRequest) {
      throw new NotFoundException(
        `Borrow request with ID ${dto.borrowRequestId} not found`,
      );
    }

    const existing = await this.prisma.fine.findUnique({
      where: { borrowRequestId: dto.borrowRequestId },
    });
    if (existing) {
      throw new BadRequestException(
        'A fine already exists for this borrow request',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const fine = await tx.fine.create({
        data: {
          borrowRequestId: dto.borrowRequestId,
          userId: borrowRequest.userId,
          amount: dto.amount,
          reason: dto.reason,
          status: FineStatus.UNPAID,
        },
      });

      await tx.notification.create({
        data: {
          userId: borrowRequest.userId,
          message: `A fine of ${dto.amount.toFixed(2)} has been issued. Reason: ${dto.reason}`,
          type: 'FINE_ISSUED',
        },
      });

      return fine;
    });
  }

  async findAll(query: FineQueryDto) {
    const { page, limit, userId, status } = query;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const [total, fines] = await Promise.all([
      this.prisma.fine.count({ where }),
      this.prisma.fine.findMany({
        where,
        skip,
        take: limit,
        include: {
          borrowRequest: {
            include: { device: { select: { id: true, name: true } } },
          },
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: fines,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findMyFines(userId: string, query: FineQueryDto) {
    return this.findAll({ ...query, userId });
  }

  async findOne(id: string) {
    const fine = await this.prisma.fine.findUnique({
      where: { id },
      include: {
        borrowRequest: {
          include: { device: { select: { id: true, name: true } } },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!fine) {
      throw new NotFoundException(`Fine with ID ${id} not found`);
    }

    return fine;
  }

  async pay(id: string, dto: PayFineDto) {
    const fine = await this.prisma.fine.findUnique({ where: { id } });
    if (!fine) {
      throw new NotFoundException(`Fine with ID ${id} not found`);
    }
    if (fine.status !== FineStatus.UNPAID) {
      throw new BadRequestException(
        `Fine is already ${fine.status.toLowerCase()}, cannot pay again`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.fine.update({
        where: { id },
        data: {
          status: FineStatus.PAID,
          paidAt: new Date(),
        },
      });

      await tx.notification.create({
        data: {
          userId: fine.userId,
          message: `Your fine of ${Number(fine.amount).toFixed(2)} has been marked as paid.`,
          type: 'FINE_PAID',
        },
      });

      return updated;
    });
  }

  async waive(id: string, adminId: string, dto: WaiveFineDto) {
    const fine = await this.prisma.fine.findUnique({ where: { id } });
    if (!fine) {
      throw new NotFoundException(`Fine with ID ${id} not found`);
    }
    if (fine.status !== FineStatus.UNPAID) {
      throw new BadRequestException(
        `Fine is already ${fine.status.toLowerCase()}, cannot waive`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.fine.update({
        where: { id },
        data: {
          status: FineStatus.WAIVED,
          waivedBy: adminId,
          waivedAt: new Date(),
          waivedReason: dto.waivedReason,
        },
      });

      await tx.notification.create({
        data: {
          userId: fine.userId,
          message: `Your fine of ${Number(fine.amount).toFixed(2)} has been waived. Reason: ${dto.waivedReason}`,
          type: 'FINE_WAIVED',
        },
      });

      return updated;
    });
  }
}
