import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityLogsService {
  constructor(private prisma: PrismaService) {}

  logActivity(userId: number, action: string, description?: string, ipAddress?: string) {
    return this.prisma.activityLog.create({
      data: {
        userId,
        action,
        description,
        ipAddress,
      },
    });
  }

  findAll() {
    return this.prisma.activityLog.findMany({
      orderBy: { timestamp: 'desc' },
      include: { user: { select: { email: true, role: true } } },
    });
  }
}
