import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, AssetType } from '@prisma/client';
import { DocumentAccessService } from '../access/document-access.service';
import { Principal } from './permission.service';

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8001';

export interface SearchFilters {
  q?: string;
  type?: string;
  ownerId?: number;
  from?: string;
  to?: string;
  tags?: string[];
  semantic?: boolean;
}

/**
 * Unified search over the explorer: Postgres structural filters (name, type,
 * owner, date, tags) merged with the BGE-M3 semantic content pipeline. Results
 * are scoped to a workspace the caller can access and annotated with how they
 * matched ("name"/"metadata" vs "content").
 */
@Injectable()
export class ExplorerSearchService {
  private readonly logger = new Logger(ExplorerSearchService.name);

  constructor(
    private prisma: PrismaService,
    private access: DocumentAccessService,
  ) {}

  /** Active users available to share with (id + email + role). */
  listShareableUsers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, role: true },
      orderBy: { email: 'asc' },
    });
  }

  /** Role visibility filter shared by structural + semantic lookups. */
  private async visibility(user: Principal): Promise<Prisma.AssetWhereInput> {
    if (user.role === 'ADMIN') return {};
    const grants = await this.prisma.assetPermission.findMany({
      where: { userId: user.id }, select: { assetId: true },
    });
    const sharedIds = grants.map((g) => g.assetId);
    return user.role === 'EXPERT'
      ? { OR: [{ ownerId: user.id }, { id: { in: sharedIds } }] }
      : { OR: [{ id: { in: sharedIds } }] };
  }

  async search(user: Principal, f: SearchFilters) {
    const vis = await this.visibility(user);

    // ── Structural (Postgres) ──
    const where: Prisma.AssetWhereInput = { ...vis, status: 'ACTIVE' };
    if (f.q) where.name = { contains: f.q, mode: 'insensitive' };
    if (f.type) where.type = f.type as AssetType;
    if (f.ownerId) where.ownerId = f.ownerId;
    if (f.from || f.to) {
      where.createdAt = {
        ...(f.from ? { gte: new Date(f.from) } : {}),
        ...(f.to ? { lte: new Date(f.to) } : {}),
      };
    }
    if (f.tags?.length) where.tags = { some: { tag: { name: { in: f.tags } } } };

    const structural = await this.prisma.asset.findMany({
      where,
      take: 100,
      orderBy: { updatedAt: 'desc' },
      include: { tags: { include: { tag: true } } },
    });

    const byId = new Map<string, any>();
    for (const a of structural) byId.set(a.id, { ...a, match: 'metadata' });

    // ── Semantic (BGE-M3 content search), merged in ──
    if (f.q && f.semantic) {
      try {
        const allowedRefs = await this.access.getAccessibleRefs(user.id, user.role);
        const res = await fetch(`${SCRAPER_URL}/search/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: f.q, limit: 20, allowed_refs: allowedRefs }),
        });
        if (res.ok) {
          const data = await res.json();
          const refs: string[] = (data.results ?? []).map((r: any) => `${r.type}:${r.doc_id}`);
          if (refs.length) {
            // allowed_refs already RBAC-scoped the semantic results; match them to assets
            const contentAssets = await this.prisma.asset.findMany({
              where: {
                status: 'ACTIVE',
                OR: refs.map((ref) => ({ metadata: { path: ['ref'], equals: ref } })),
              },
              include: { tags: { include: { tag: true } } },
            });
            for (const a of contentAssets) {
              if (byId.has(a.id)) byId.get(a.id).match = 'name+content';
              else byId.set(a.id, { ...a, match: 'content' });
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Semantic search merge failed: ${(err as Error).message}`);
      }
    }

    return Array.from(byId.values());
  }
}
