import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { Role } from '../../generated/prisma';
import { StudentDashboardService } from './student.service';


type AuthRequest = Request & { user: { userId: string; role: Role } };

@Controller('student/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class StudentDashboardController {
  constructor(private readonly service: StudentDashboardService) {}

  @Get()
  async getDashboardStats(@Req() req: AuthRequest) {
    return this.service.getDashboardStats(req.user.userId);
  }
}
