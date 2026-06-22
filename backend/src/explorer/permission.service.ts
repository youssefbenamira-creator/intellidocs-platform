import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Asset, PermissionLevel } from '@prisma/client';

const RANK: Record<PermissionLevel, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export interface Principal {
  id: number;
  role: string; // ADMIN | EXPERT | DECISION_MAKER
}

/**
 * Resolves the effective permission a user has on an asset, combining:
 *   1. platform ADMIN role (full access)
 *   2. asset ownership
 *   3. direct AssetPermission grants
 *   4. inherited grants from ancestor folders (via materialized path)
 *   5. workspace membership level (floor)
 * The highest applicable level wins.
 */
@Injectable()
export class PermissionService {
  constructor(private prisma: PrismaService) {}

  /** Ancestor asset ids encoded in a materialized path "/a/b/c/" (excludes self). */
  ancestorIds(asset: Pick<Asset, 'id' | 'path'>): string[] {
    return asset.path.split('/').filter((seg) => seg && seg !== asset.id);
  }

  async resolve(user: Principal, asset: Asset): Promise<PermissionLevel | null> {
    if (user.role === 'ADMIN') return 'OWNER';
    if (asset.ownerId === user.id) return 'OWNER';

    let best: PermissionLevel | null = null;
    const consider = (lvl?: PermissionLevel | null) => {
      if (lvl && (best === null || RANK[lvl] > RANK[best])) best = lvl;
    };

    // Direct + inherited grants: any permission for this user on the asset or an ancestor
    const scopeIds = [asset.id, ...this.ancestorIds(asset)];
    const grants = await this.prisma.assetPermission.findMany({
      where: { userId: user.id, assetId: { in: scopeIds } },
      select: { level: true },
    });
    for (const g of grants) consider(g.level);

    // Workspace membership acts as a floor across the whole workspace
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: asset.workspaceId, userId: user.id } },
      select: { level: true },
    });
    consider(member?.level);

    return best;
  }

  async assert(user: Principal, asset: Asset, needed: PermissionLevel): Promise<void> {
    const level = await this.resolve(user, asset);
    if (!level || RANK[level] < RANK[needed]) {
      throw new ForbiddenException(`Requires ${needed} permission on this asset`);
    }
  }

  /** Load an asset or 404, used by controllers before permission checks. */
  async getAssetOr404(assetId: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  static atLeast(a: PermissionLevel, b: PermissionLevel): boolean {
    return RANK[a] >= RANK[b];
  }
}
