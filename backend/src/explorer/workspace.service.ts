import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Principal } from './permission.service';

@Injectable()
export class WorkspaceService {
  constructor(private prisma: PrismaService) {}

  /** Returns the user's default workspace, creating it on first access. */
  async getOrCreateDefault(userId: number) {
    const existing = await this.prisma.workspace.findFirst({
      where: { ownerId: userId, isDefault: true },
    });
    if (existing) return existing;

    return this.prisma.workspace.create({
      data: {
        name: 'My Workspace',
        ownerId: userId,
        isDefault: true,
        members: { create: { userId, level: 'OWNER' } },
      },
    });
  }

  /** Workspaces the user owns or is a member of. */
  async listForUser(userId: number) {
    return this.prisma.workspace.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { assets: true, members: true } } },
    });
  }

  async create(userId: number, name: string) {
    return this.prisma.workspace.create({
      data: {
        name,
        ownerId: userId,
        members: { create: { userId, level: 'OWNER' } },
      },
    });
  }

  /** Throws unless the user owns or belongs to the workspace (ADMIN bypasses). */
  async assertAccess(user: Principal, workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    if (user.role === 'ADMIN' || ws.ownerId === user.id) return ws;

    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
    });
    if (!member) throw new ForbiddenException('No access to this workspace');
    return ws;
  }

  async addMember(user: Principal, workspaceId: string, userId: number, level: 'VIEWER' | 'EDITOR' | 'OWNER') {
    const ws = await this.assertAccess(user, workspaceId);
    if (user.role !== 'ADMIN' && ws.ownerId !== user.id) {
      throw new ForbiddenException('Only the workspace owner can manage members');
    }
    return this.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId, level },
      update: { level },
    });
  }
}
