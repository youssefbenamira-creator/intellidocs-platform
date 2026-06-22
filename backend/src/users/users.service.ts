import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async create(createUserDto: CreateUserDto, actorId?: number) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
    });
    if (actorId) {
      this.activityLogsService.logActivity(
        actorId,
        'CREATE_USER',
        `Created user ${user.email} with role ${user.role}`,
      ).catch(() => {});
    }
    return user;
  }

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true, isActive: true, createdAt: true },
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: number, updateUserDto: UpdateUserDto, actorId?: number) {
    const data: any = { ...updateUserDto };
    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data,
    });
    if (actorId) {
      this.activityLogsService.logActivity(
        actorId,
        'UPDATE_USER',
        `Updated user #${id}: ${JSON.stringify(Object.keys(updateUserDto))}`,
      ).catch(() => {});
    }
    return updated;
  }

  async remove(id: number, actorId?: number) {
    if (actorId) {
      this.activityLogsService.logActivity(
        actorId,
        'DELETE_USER',
        `Deleted user #${id}`,
      ).catch(() => {});
    }
    return this.prisma.user.delete({ where: { id } });
  }

  async updateRefreshToken(userId: number, refreshToken: string | null) {
    if (refreshToken) {
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      await this.prisma.user.update({
        where: { id: userId },
        data: { hashedRefreshToken },
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { hashedRefreshToken: null },
      });
    }
  }
}
