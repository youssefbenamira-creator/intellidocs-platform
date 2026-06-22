import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Asset, AssetType, Prisma } from '@prisma/client';
import { ActivityService } from './activity.service';
import { AssetIndexSyncService } from './asset-index-sync.service';
import { PermissionService, Principal } from './permission.service';

const CONTAINER_TYPES: AssetType[] = ['FOLDER', 'SCRAPED_SITE'];

export interface CreateAssetParams {
  workspaceId: string;
  ownerId: number;
  parentId?: string | null;
  type: AssetType;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | bigint | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AssetService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivityService,
    private indexSync: AssetIndexSyncService,
    private perms: PermissionService,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────────

  private static ASSET_INCLUDE = {
    _count: { select: { children: true } },
    tags: { include: { tag: true } },
  };

  /** Containers (folders / sites) first, then alphabetical. */
  private sortItems<T extends { type: AssetType; name: string }>(assets: T[]): T[] {
    return assets.sort((a, b) => {
      const ac = CONTAINER_TYPES.includes(a.type) ? 0 : 1;
      const bc = CONTAINER_TYPES.includes(b.type) ? 0 : 1;
      return ac - bc || a.name.localeCompare(b.name);
    });
  }

  /**
   * Role-scoped listing:
   *  - inside a folder → all children (caller already proven to have access to the parent)
   *  - at the root:
   *      ADMIN          → every root asset (all workspaces)
   *      EXPERT         → own root assets + anything shared with them
   *      DECISION_MAKER → only what is shared with them
   * Shared items surface as entry points ("Shared with me") even when they are
   * nested inside another user's tree.
   */
  async listForUser(user: Principal, parentId: string | null, trashed = false) {
    const status = trashed ? 'TRASHED' : 'ACTIVE';
    const include = AssetService.ASSET_INCLUDE;

    if (parentId) {
      const parent = await this.get(parentId);
      await this.perms.assert(user, parent, 'VIEWER');
      return this.sortItems(await this.prisma.asset.findMany({ where: { parentId, status }, include }));
    }

    if (user.role === 'ADMIN') {
      return this.sortItems(await this.prisma.asset.findMany({ where: { parentId: null, status }, include }));
    }

    const grants = await this.prisma.assetPermission.findMany({
      where: { userId: user.id }, select: { assetId: true },
    });
    const sharedIds = grants.map((g) => g.assetId);
    const where: Prisma.AssetWhereInput =
      user.role === 'EXPERT'
        ? { status, OR: [{ parentId: null, ownerId: user.id }, { id: { in: sharedIds } }] }
        : { status, id: { in: sharedIds } };
    return this.sortItems(await this.prisma.asset.findMany({ where, include }));
  }

  async get(id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  /** Ordered ancestor chain (root → parent) for breadcrumbs. */
  async breadcrumbs(asset: Asset) {
    const ids = asset.path.split('/').filter((s) => s && s !== asset.id);
    if (ids.length === 0) return [];
    const ancestors = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, type: true, depth: true },
    });
    return ancestors.sort((a, b) => a.depth - b.depth);
  }

  // ── Writes ─────────────────────────────────────────────────────────────

  /** Create any asset, computing its materialized path from the parent. */
  async createAsset(p: CreateAssetParams): Promise<Asset> {
    let parent: Asset | null = null;
    if (p.parentId) {
      parent = await this.prisma.asset.findUnique({ where: { id: p.parentId } });
      if (!parent || parent.workspaceId !== p.workspaceId) {
        throw new BadRequestException('Parent folder not found in this workspace');
      }
      if (!CONTAINER_TYPES.includes(parent.type)) {
        throw new BadRequestException('Parent must be a folder or scraped site');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          workspaceId: p.workspaceId,
          ownerId: p.ownerId,
          parentId: p.parentId ?? null,
          type: p.type,
          name: p.name,
          mimeType: p.mimeType ?? null,
          sizeBytes: p.sizeBytes != null ? BigInt(p.sizeBytes) : null,
          metadata: p.metadata,
          path: '/',
          depth: 0,
        },
      });
      const path = `${parent ? parent.path : '/'}${created.id}/`;
      const depth = parent ? parent.depth + 1 : 0;
      return tx.asset.update({ where: { id: created.id }, data: { path, depth } });
    });
  }

  async createFolder(workspaceId: string, ownerId: number, parentId: string | null, name: string) {
    const asset = await this.createAsset({ workspaceId, ownerId, parentId, type: 'FOLDER', name });
    this.activity.log(workspaceId, ownerId, 'CREATE', asset.id, { type: 'FOLDER', name });
    return asset;
  }

  async rename(asset: Asset, actorId: number, name: string) {
    const updated = await this.prisma.asset.update({ where: { id: asset.id }, data: { name } });
    this.activity.log(asset.workspaceId, actorId, 'RENAME', asset.id, { from: asset.name, to: name });
    return updated;
  }

  /**
   * Move an asset (and its whole subtree) under a new parent. Rewrites the
   * materialized path/depth of every descendant in a single statement.
   */
  async move(asset: Asset, actorId: number, newParentId: string | null) {
    let newParent: Asset | null = null;
    if (newParentId) {
      newParent = await this.prisma.asset.findUnique({ where: { id: newParentId } });
      if (!newParent) throw new BadRequestException('Target folder not found');
      if (newParent.workspaceId !== asset.workspaceId) {
        throw new BadRequestException('Cannot move across workspaces');
      }
      if (!CONTAINER_TYPES.includes(newParent.type)) {
        throw new BadRequestException('Target must be a folder or scraped site');
      }
      // Cycle guard: target must not be the asset itself or one of its descendants
      if (newParent.path.startsWith(asset.path)) {
        throw new BadRequestException('Cannot move a folder into itself or its descendant');
      }
    }
    if ((asset.parentId ?? null) === (newParentId ?? null)) return asset;

    const oldPath = asset.path;
    const newPath = `${newParent ? newParent.path : '/'}${asset.id}/`;
    const newDepth = newParent ? newParent.depth + 1 : 0;
    const depthDelta = newDepth - asset.depth;

    await this.prisma.$transaction([
      // Rewrite the subtree's paths and depths (node + all descendants).
      // oldPath ends with the node's unique id, so it occurs exactly once as a
      // prefix in every descendant path — a single replace() is correct.
      this.prisma.$executeRaw`
        UPDATE "Asset"
        SET "path" = replace("path", ${oldPath}, ${newPath}),
            "depth" = "depth" + ${depthDelta},
            "updatedAt" = now()
        WHERE "path" LIKE ${oldPath + '%'}
      `,
      // Re-point only the moved node to its new parent
      this.prisma.asset.update({ where: { id: asset.id }, data: { parentId: newParentId ?? null } }),
    ]);

    this.activity.log(asset.workspaceId, actorId, 'MOVE', asset.id, {
      from: asset.parentId, to: newParentId,
    });
    return this.get(asset.id);
  }

  /** Recursively copy an asset subtree under a new parent. */
  async copy(asset: Asset, actorId: number, newParentId: string | null): Promise<Asset> {
    if (newParentId) {
      const target = await this.prisma.asset.findUnique({ where: { id: newParentId } });
      if (!target) throw new BadRequestException('Target folder not found');
      if (target.path.startsWith(asset.path)) {
        throw new BadRequestException('Cannot copy a folder into itself or its descendant');
      }
    }
    const root = await this.cloneSubtree(asset, newParentId, asset.name);
    this.activity.log(asset.workspaceId, actorId, 'COPY', root.id, { from: asset.id });
    return root;
  }

  private async cloneSubtree(src: Asset, newParentId: string | null, name: string): Promise<Asset> {
    const clone = await this.createAsset({
      workspaceId: src.workspaceId,
      ownerId: src.ownerId,
      parentId: newParentId,
      type: src.type,
      name,
      mimeType: src.mimeType,
      sizeBytes: src.sizeBytes ?? undefined,
      metadata: (src.metadata as Prisma.InputJsonValue) ?? undefined,
    });
    const children = await this.prisma.asset.findMany({
      where: { parentId: src.id, status: 'ACTIVE' },
    });
    for (const child of children) {
      await this.cloneSubtree(child, clone.id, child.name);
    }
    return clone;
  }

  /** Soft-delete an asset and its subtree. */
  async trash(asset: Asset, actorId: number) {
    await this.prisma.$executeRaw`
      UPDATE "Asset"
      SET "status" = 'TRASHED', "trashedAt" = now(), "updatedAt" = now()
      WHERE "path" LIKE ${asset.path + '%'} AND "status" = 'ACTIVE'
    `;
    this.indexSync.onTrash(asset); // hide vectors from retrieval (best-effort)
    this.activity.log(asset.workspaceId, actorId, 'TRASH', asset.id, { name: asset.name });
    return { trashed: true };
  }

  /** Restore a trashed asset and its subtree. */
  async restore(asset: Asset, actorId: number) {
    await this.prisma.$executeRaw`
      UPDATE "Asset"
      SET "status" = 'ACTIVE', "trashedAt" = NULL, "updatedAt" = now()
      WHERE "path" LIKE ${asset.path + '%'} AND "status" = 'TRASHED'
    `;
    this.indexSync.onRestore(asset); // re-expose vectors to retrieval (best-effort)
    this.activity.log(asset.workspaceId, actorId, 'RESTORE', asset.id, { name: asset.name });
    return { restored: true };
  }

  /** Permanently delete an asset subtree (children cascade via FK). */
  async purge(asset: Asset, actorId: number) {
    // Collect refs before deletion so we can remove their vectors afterwards
    const refs = await this.indexSync.collectRefs(asset);
    await this.prisma.asset.delete({ where: { id: asset.id } });
    this.indexSync.onPurge(refs); // permanently remove vectors (best-effort)
    this.activity.log(asset.workspaceId, actorId, 'PURGE', null, { id: asset.id, name: asset.name });
    return { purged: true };
  }
}
