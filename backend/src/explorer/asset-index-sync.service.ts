import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Asset } from '@prisma/client';

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8001';

/**
 * Keeps the Qdrant vector store in sync with explorer asset lifecycle events.
 * Assets carry their RAG ref ("{type}:{doc_id}") in metadata.ref; this service
 * collects the refs in an asset's subtree and toggles/removes their vectors.
 * All calls are best-effort so they never block the explorer operation.
 */
@Injectable()
export class AssetIndexSyncService {
  private readonly logger = new Logger(AssetIndexSyncService.name);

  constructor(private prisma: PrismaService) {}

  /** Collect the RAG refs of every content asset in a subtree (by materialized path). */
  async collectRefs(asset: Asset): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ ref: string }[]>`
      SELECT metadata->>'ref' AS ref
      FROM "Asset"
      WHERE "path" LIKE ${asset.path + '%'}
        AND metadata->>'ref' IS NOT NULL
    `;
    return rows.map((r) => r.ref).filter(Boolean);
  }

  async setActive(refs: string[], active: boolean): Promise<void> {
    if (!refs.length) return;
    try {
      await fetch(`${SCRAPER_URL}/search/set-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs, active }),
      });
    } catch (err) {
      this.logger.warn(`Vector set-active failed: ${(err as Error).message}`);
    }
  }

  async remove(refs: string[]): Promise<void> {
    if (!refs.length) return;
    try {
      await fetch(`${SCRAPER_URL}/search/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs }),
      });
    } catch (err) {
      this.logger.warn(`Vector remove failed: ${(err as Error).message}`);
    }
  }

  // Convenience wrappers used by AssetService lifecycle hooks
  async onTrash(asset: Asset) {
    this.setActive(await this.collectRefs(asset), false);
  }
  async onRestore(asset: Asset) {
    this.setActive(await this.collectRefs(asset), true);
  }
  async onPurge(refs: string[]) {
    this.remove(refs);
  }
}
