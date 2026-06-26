import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { JwtAuthGuard } from '../src/auth/guard/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guard/roles.guard';
import { Reflector } from '@nestjs/core';
import { Role } from '../generated/prisma';
import { ROLES_KEY } from '../src/auth/decorator/roles.decorator';
import { AuthService } from '../src/auth/auth.service';
import { UserService } from '../src/user/user.service';
import { CategoryService } from '../src/category/category.service';
import { DeviceService } from '../src/device/device.service';
import { InventoryLogService } from '../src/inventory-log/inventory-log.service';
import { NotificationService } from '../src/notification/notification.service';
import { AdminService } from '../src/admin/admin.service';
import { CloudinaryService } from '../src/cloudinary/cloudinary.service';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('API Routes (e2e)', () => {
  let app: INestApplication<App>;
  let currentUser: { userId: string; email: string; role: Role } | null = null;

  // Mock service implementations
  const mockAuthService = {
    register: jest.fn().mockImplementation((dto) => ({
      id: 'mock-user-id',
      email: dto.email,
      role: Role.STUDENT,
    })),
    login: jest.fn().mockReturnValue({ accessToken: 'mock-jwt-token' }),
    verifyEmail: jest
      .fn()
      .mockReturnValue({ message: 'Email verified successfully' }),
    updateProfile: jest
      .fn()
      .mockImplementation((userId, dto) => ({ id: userId, ...dto })),
    forgotPassword: jest.fn().mockReturnValue({ message: 'Reset token sent' }),
    resetPassword: jest
      .fn()
      .mockReturnValue({ message: 'Password reset successful' }),
    changePassword: jest
      .fn()
      .mockReturnValue({ message: 'Password changed successfully' }),
  };

  const mockUserService = {
    findOne: jest.fn().mockImplementation((id) => ({
      id,
      email: 'user@example.com',
      role: Role.STUDENT,
    })),
    findAll: jest.fn().mockReturnValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
    }),
    create: jest
      .fn()
      .mockImplementation((dto) => ({ id: 'new-user-id', ...dto })),
    update: jest.fn().mockImplementation((id, dto) => ({ id, ...dto })),
    remove: jest.fn().mockImplementation((id) => ({
      message: 'User deleted successfully',
      id,
    })),
  };

  const mockCategoryService = {
    findAll: jest.fn().mockReturnValue([]),
    findOne: jest
      .fn()
      .mockImplementation((id) => ({ id, name: 'Test Category' })),
    create: jest.fn().mockImplementation((dto) => ({ id: 'cat-id', ...dto })),
    update: jest.fn().mockImplementation((id, dto) => ({ id, ...dto })),
    remove: jest.fn().mockImplementation((id) => ({ id })),
  };

  const mockDeviceService = {
    findAll: jest.fn().mockReturnValue({ data: [], meta: {} }),
    findOne: jest
      .fn()
      .mockImplementation((id) => ({ id, name: 'Test Device' })),
    create: jest.fn().mockImplementation((dto) => ({ id: 'dev-id', ...dto })),
    update: jest.fn().mockImplementation((id, dto) => ({ id, ...dto })),
    remove: jest.fn().mockImplementation((id) => ({ id })),
  };

  const mockInventoryLogService = {
    findAll: jest.fn().mockReturnValue([]),
    createManualLog: jest
      .fn()
      .mockImplementation((dto) => ({ id: 'log-id', ...dto })),
  };

  const mockNotificationService = {
    getMyNotifications: jest.fn().mockReturnValue([]),
    markAllAsRead: jest.fn().mockReturnValue({ count: 5 }),
    markAsRead: jest.fn().mockReturnValue({ id: 'notif-id', isRead: true }),
    createNotification: jest
      .fn()
      .mockImplementation((dto) => ({ id: 'notif-id', ...dto })),
  };

  const mockAdminService = {
    getDashboardStats: jest
      .fn()
      .mockReturnValue({ totalDevices: 10, totalUsers: 2 }),
  };

  const mockCloudinaryService = {
    uploadFile: jest
      .fn()
      .mockResolvedValue({ secure_url: 'https://cloudinary.com/mock.jpg' }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentUser) {
            throw new UnauthorizedException('Mock Unauthorized');
          }
          const req = context.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          if (!req.user) {
            return false;
          }
          const requiredRoles = new Reflector().getAllAndOverride<Role[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
          );
          if (!requiredRoles || requiredRoles.length === 0) {
            return true;
          }
          return requiredRoles.includes(req.user.role);
        },
      })
      .overrideProvider(AuthService)
      .useValue(mockAuthService)
      .overrideProvider(UserService)
      .useValue(mockUserService)
      .overrideProvider(CategoryService)
      .useValue(mockCategoryService)
      .overrideProvider(DeviceService)
      .useValue(mockDeviceService)
      .overrideProvider(InventoryLogService)
      .useValue(mockInventoryLogService)
      .overrideProvider(NotificationService)
      .useValue(mockNotificationService)
      .overrideProvider(AdminService)
      .useValue(mockAdminService)
      .overrideProvider(CloudinaryService)
      .useValue(mockCloudinaryService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Reset roles between tests
  beforeEach(() => {
    currentUser = null;
  });

  describe('Auth Routes', () => {
    it('POST /auth/register', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(201)
        .expect((res: any) => {
          expect(res.body.email).toBe('test@example.com');
        });
    });

    it('POST /auth/login', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(201)
        .expect({ accessToken: 'mock-jwt-token' });
    });

    it('GET /auth/verify', () => {
      return request(app.getHttpServer())
        .get('/auth/verify?token=verify-token')
        .expect(200)
        .expect({ message: 'Email verified successfully' });
    });

    it('PATCH /auth/profile (Authenticated)', () => {
      currentUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: Role.STUDENT,
      };
      return request(app.getHttpServer())
        .patch('/auth/profile')
        .send({ firstName: 'Imam', lastName: 'Hossen' })
        .expect(200);
    });

    it('POST /auth/forgot-password', () => {
      return request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(201);
    });

    it('POST /auth/reset-password', () => {
      return request(app.getHttpServer())
        .post('/auth/reset-password?token=reset-token')
        .send({ password: 'new-password' })
        .expect(201);
    });

    it('POST /auth/change-password (Authenticated)', () => {
      currentUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: Role.STUDENT,
      };
      return request(app.getHttpServer())
        .post('/auth/change-password')
        .send({ oldPassword: 'old', newPassword: 'new' })
        .expect(201);
    });
  });

  describe('User Routes', () => {
    it('GET /users/me (Authenticated)', () => {
      currentUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: Role.STUDENT,
      };
      return request(app.getHttpServer())
        .get('/users/me')
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toBe('user-123');
        });
    });

    it('GET /users (Admin Only - Approved)', () => {
      currentUser = {
        userId: 'admin-123',
        email: 'admin@example.com',
        role: Role.ADMIN,
      };
      return request(app.getHttpServer()).get('/users').expect(200);
    });

    it('GET /users (STUDENT - Forbidden)', () => {
      currentUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: Role.STUDENT,
      };
      return request(app.getHttpServer()).get('/users').expect(403);
    });

    it('GET /users/:id (Admin)', () => {
      currentUser = {
        userId: 'admin-123',
        email: 'admin@example.com',
        role: Role.ADMIN,
      };
      return request(app.getHttpServer()).get('/users/some-id').expect(200);
    });

    it('POST /users (Admin)', () => {
      currentUser = {
        userId: 'admin-123',
        email: 'admin@example.com',
        role: Role.ADMIN,
      };
      return request(app.getHttpServer())
        .post('/users')
        .send({ email: 'new@example.com', password: 'pwd', role: Role.STUDENT })
        .expect(201);
    });

    it('PATCH /users/:id (Admin)', () => {
      currentUser = {
        userId: 'admin-123',
        email: 'admin@example.com',
        role: Role.ADMIN,
      };
      return request(app.getHttpServer())
        .patch('/users/some-id')
        .send({ role: Role.STAFF })
        .expect(200);
    });

    it('DELETE /users/:id (Admin)', () => {
      currentUser = {
        userId: 'admin-123',
        email: 'admin@example.com',
        role: Role.ADMIN,
      };
      return request(app.getHttpServer()).delete('/users/some-id').expect(200);
    });
  });

  describe('Category Routes', () => {
    it('GET /categories', () => {
      currentUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: Role.STUDENT,
      };
      return request(app.getHttpServer()).get('/categories').expect(200);
    });

    it('POST /categories (STAFF Allowed)', () => {
      currentUser = {
        userId: 'STAFF-123',
        email: 'STAFF@example.com',
        role: Role.STAFF,
      };
      return request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Laptops' })
        .expect(201);
    });

    it('POST /categories (STUDENT Forbidden)', () => {
      currentUser = {
        userId: 'user-123',
        email: 'STUDENT@example.com',
        role: Role.STUDENT,
      };
      return request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Laptops' })
        .expect(403);
    });
  });

  describe('Device Routes', () => {
    it('GET /devices', () => {
      currentUser = {
        userId: 'user-123',
        email: 'STUDENT@example.com',
        role: Role.STUDENT,
      };
      return request(app.getHttpServer()).get('/devices').expect(200);
    });

    it('POST /devices (STAFF Allowed)', () => {
      currentUser = {
        userId: 'STAFF-123',
        email: 'STAFF@example.com',
        role: Role.STAFF,
      };
      return request(app.getHttpServer())
        .post('/devices')
        .send({ name: 'MacBook' })
        .expect(201);
    });
  });

  describe('Inventory Log Routes', () => {
    it('GET /inventory-logs (STAFF Allowed)', () => {
      currentUser = {
        userId: 'STAFF-123',
        email: 'STAFF@example.com',
        role: Role.STAFF,
      };
      return request(app.getHttpServer()).get('/inventory-logs').expect(200);
    });

    it('GET /inventory-logs (STUDENT Forbidden)', () => {
      currentUser = {
        userId: 'user-123',
        email: 'STUDENT@example.com',
        role: Role.STUDENT,
      };
      return request(app.getHttpServer()).get('/inventory-logs').expect(403);
    });
  });

  describe('Notification Routes', () => {
    it('GET /notifications (Any user)', () => {
      currentUser = {
        userId: 'user-123',
        email: 'STUDENT@example.com',
        role: Role.STUDENT,
      };
      return request(app.getHttpServer()).get('/notifications').expect(200);
    });

    it('POST /notifications (Admin Only)', () => {
      currentUser = {
        userId: 'admin-123',
        email: 'admin@example.com',
        role: Role.ADMIN,
      };
      return request(app.getHttpServer())
        .post('/notifications')
        .send({ userId: 'user-123', message: 'Hello', type: 'INFO' })
        .expect(201);
    });

    it('POST /notifications (STAFF Forbidden)', () => {
      currentUser = {
        userId: 'STAFF-123',
        email: 'STAFF@example.com',
        role: Role.STAFF,
      };
      return request(app.getHttpServer())
        .post('/notifications')
        .send({ userId: 'user-123', message: 'Hello', type: 'INFO' })
        .expect(403);
    });
  });

  describe('Admin Routes', () => {
    it('GET /admin/dashboard (Admin Allowed)', () => {
      currentUser = {
        userId: 'admin-123',
        email: 'admin@example.com',
        role: Role.ADMIN,
      };
      return request(app.getHttpServer()).get('/admin/dashboard').expect(200);
    });

    it('GET /admin/dashboard (STAFF Forbidden)', () => {
      currentUser = {
        userId: 'STAFF-123',
        email: 'STAFF@example.com',
        role: Role.STAFF,
      };
      return request(app.getHttpServer()).get('/admin/dashboard').expect(403);
    });
  });
});
