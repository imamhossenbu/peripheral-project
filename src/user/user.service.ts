// import {
//   Injectable,
//   NotFoundException,
//   BadRequestException,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';
// import { Prisma } from '../../generated/prisma';
// import * as bcrypt from 'bcrypt';

// type SafeUser = Omit<
//   Prisma.UserGetPayload<Record<string, never>>,
//   | 'password'
//   | 'verificationToken'
//   | 'resetPasswordToken'
//   | 'resetPasswordExpiry'
// >;

// @Injectable()
// export class UserService {
//   constructor(private prisma: PrismaService) {}

//   private sanitize(user: any): SafeUser {
//     if (!user) return null as any;
//     const {
//       password,
//       verificationToken,
//       resetPasswordToken,
//       resetPasswordExpiry,
//       ...safe
//     } = user;
//     return safe;
//   }

//   // ─── Find All (paginated, filtered, sorted) ─────────────────
//   async findAll(query: UserQueryDto) {
//     const {
//       page = 1,
//       limit = 10,
//       search,
//       role,
//       isVerified,
//       sortBy = 'createdAt',
//       sortOrder = 'desc',
//     } = query;

//     const skip = (page - 1) * limit;

//     const where: Prisma.UserWhereInput = {
//       ...(role && { role }),
//       ...(isVerified !== undefined && { isVerified }),
//       ...(search && {
//         OR: [
//           { email: { contains: search, mode: 'insensitive' } },
//           { firstName: { contains: search, mode: 'insensitive' } },
//           { lastName: { contains: search, mode: 'insensitive' } },
//           { department: { contains: search, mode: 'insensitive' } },
//         ],
//       }),
//     };

//     const [total, users] = await this.prisma.$transaction([
//       this.prisma.user.count({ where }),
//       this.prisma.user.findMany({
//         where,
//         skip,
//         take: limit,
//         orderBy: { [sortBy]: sortOrder },
//         // sensitive fields select থেকে বাদ
//         select: {
//           id: true,
//           email: true,
//           role: true,
//           firstName: true,
//           lastName: true,
//           department: true,
//           imageUrl: true,
//           isVerified: true,
//           createdAt: true,
//           updatedAt: true,
//         },
//       }),
//     ]);

//     return {
//       data: users,
//       meta: {
//         total,
//         page,
//         limit,
//         totalPages: Math.ceil(total / limit),
//         hasNext: page < Math.ceil(total / limit),
//         hasPrev: page > 1,
//       },
//     };
//   }

//   // ─── Find One ───────────────────────────────────────────────
//   async findOne(id: string): Promise<SafeUser> {
//     const user = await this.prisma.user.findUnique({
//       where: { id },
//       select: {
//         id: true,
//         email: true,
//         role: true,
//         firstName: true,
//         lastName: true,
//         department: true,
//         imageUrl: true,
//         isVerified: true,
//         createdAt: true,
//         updatedAt: true,
//       },
//     });

//     if (!user) throw new NotFoundException(`User #${id} not found`);
//     return user;
//   }

//   // ─── Create ─────────────────────────────────────────────────
//   async create(dto: CreateUserDto): Promise<SafeUser> {
//     const existing = await this.prisma.user.findUnique({
//       where: { email: dto.email },
//     });
//     if (existing) throw new BadRequestException('Email already exists');

//     const hash = await bcrypt.hash(dto.password, 10);

//     const user = await this.prisma.user.create({
//       data: {
//         ...dto,
//         password: hash,
//         isVerified: dto.isVerified ?? true, // admin তৈরি করলে default verified
//       },
//     });

//     return this.sanitize(user);
//   }

//   // ─── Update ─────────────────────────────────────────────────
//   async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
//     // email unique check (নিজের email বাদে)
//     if (dto.email) {
//       const existing = await this.prisma.user.findUnique({
//         where: { email: dto.email },
//       });
//       if (existing && existing.id !== id) {
//         throw new BadRequestException('Email already in use');
//       }
//     }

//     const updateData: Prisma.UserUpdateInput = { ...dto };
//     if (dto.password) {
//       updateData.password = await bcrypt.hash(dto.password, 10);
//     }

//     try {
//       const updated = await this.prisma.user.update({
//         where: { id },
//         data: updateData,
//       });
//       return this.sanitize(updated);
//     } catch (e: any) {
//       // Prisma P2025 = record not found
//       if (e?.code === 'P2025') {
//         throw new NotFoundException(`User #${id} not found`);
//       }
//       throw e;
//     }
//   }

//   // ─── Delete ─────────────────────────────────────────────────
//   async remove(id: string) {
//     // user আছে কিনা check
//     const user = await this.prisma.user.findUnique({ where: { id } });
//     if (!user) throw new NotFoundException(`User #${id} not found`);

//     // Schema তে cascade delete নেই এমন relations আগে মুছতে হবে।
//     // Prisma schema তে onDelete: Cascade থাকলে automatically হবে।
//     // যেগুলোতে নেই সেগুলো manually:
//     await this.prisma.$transaction([
//       this.prisma.notification.deleteMany({ where: { userId: id } }),
//       // Fine এ userId foreign key আছে, cascade নেই schema তে
//       this.prisma.fine.deleteMany({ where: { userId: id } }),
//       // BorrowRequest এ cascade নেই
//       this.prisma.borrowRequest.deleteMany({ where: { userId: id } }),
//       // Payment এ cascade নেই
//       this.prisma.payment.deleteMany({ where: { userId: id } }),
//       // DeviceReview
//       this.prisma.deviceReview.deleteMany({ where: { userId: id } }),
//       // Invoice
//       this.prisma.invoice.deleteMany({ where: { userId: id } }),
//       // Order (OrderItem এ cascade আছে)
//       this.prisma.order.deleteMany({ where: { userId: id } }),
//       // সবশেষে user
//       this.prisma.user.delete({ where: { id } }),
//     ]);

//     return { message: 'User deleted successfully', id };
//   }
// }

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';
import { Prisma } from '../../generated/prisma';
import * as bcrypt from 'bcrypt';

type SafeUser = Omit<
  Prisma.UserGetPayload<Record<string, never>>,
  | 'password'
  | 'verificationToken'
  | 'resetPasswordToken'
  | 'resetPasswordExpiry'
>;

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private sanitize(user: any): SafeUser {
    if (!user) return null as any;

    const {
      password,
      verificationToken,
      resetPasswordToken,
      resetPasswordExpiry,
      ...safe
    } = user;

    return safe;
  }

  // =========================
  // Find All
  // =========================

  async findAll(query: UserQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      isVerified,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(role && { role }),
      ...(isVerified !== undefined && { isVerified }),
      ...(search && {
        OR: [
          {
            email: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            firstName: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            department: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      }),
    };

    const [total, users] = await Promise.all([
      this.prisma.user.count({
        where,
      }),

      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          department: true,
          imageUrl: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  // =========================
  // Find One
  // =========================

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        department: true,
        imageUrl: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }

    return user;
  }

  // =========================
  // Create
  // =========================

  async create(dto: CreateUserDto): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const hash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        ...dto,
        password: hash,
        isVerified: dto.isVerified ?? true,
      },
    });

    return this.sanitize(user);
  }

  // =========================
  // Update
  // =========================

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      });

      if (existing && existing.id !== id) {
        throw new BadRequestException('Email already in use');
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      ...dto,
    };

    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }

    try {
      const updated = await this.prisma.user.update({
        where: {
          id,
        },
        data: updateData,
      });

      return this.sanitize(updated);
    } catch (e: any) {
      if (e?.code === 'P2025') {
        throw new NotFoundException(`User #${id} not found`);
      }

      throw e;
    }
  }

  // =========================
  // Delete
  // =========================

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }

    await this.prisma.$transaction([
      this.prisma.notification.deleteMany({
        where: { userId: id },
      }),

      this.prisma.fine.deleteMany({
        where: { userId: id },
      }),

      this.prisma.borrowRequest.deleteMany({
        where: { userId: id },
      }),

      this.prisma.payment.deleteMany({
        where: { userId: id },
      }),

      this.prisma.deviceReview.deleteMany({
        where: { userId: id },
      }),

      this.prisma.invoice.deleteMany({
        where: { userId: id },
      }),

      this.prisma.order.deleteMany({
        where: { userId: id },
      }),

      this.prisma.user.delete({
        where: { id },
      }),
    ]);

    return {
      message: 'User deleted successfully',
      id,
    };
  }
}
