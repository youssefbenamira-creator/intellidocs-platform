import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Single source of truth for which documents a user may access, expressed as
 * "{type}:{doc_id}" refs that match the payload stored in Qdrant.
 *
 *  - ADMIN          → null (unrestricted: sees everything)
 *  - EXPERT         → own uploaded docs + own scraped docs + docs shared with them
 *  - DECISION_MAKER → only docs shared with them
 *
 * A non-null empty array means "no accessible documents" (retrieval returns nothing).
 */
@Injectable()
export class DocumentAccessService {
  constructor(private prisma: PrismaService) {}

  async getAccessibleRefs(userId: number, role: string): Promise<string[] | null> {
    if (role === 'ADMIN') return null;

    const refs = new Set<string>();

    // Documents explicitly shared with this user (applies to EXPERT and DECISION_MAKER)
    const shares = await this.prisma.documentShare.findMany({
      where: { sharedWithId: userId },
      select: { documentId: true, documentType: true },
    });
    for (const s of shares) refs.add(`${s.documentType}:${s.documentId}`);

    if (role === 'EXPERT') {
      // Own uploaded documents
      const uploaded = await this.prisma.uploadedDocument.findMany({
        where: { uploadedById: userId },
        select: { id: true },
      });
      for (const d of uploaded) refs.add(`uploaded:${d.id}`);

      // Own scraped documents (via jobs the expert created)
      const scraped = await this.prisma.scrapedDocument.findMany({
        where: { job: { createdById: userId } },
        select: { id: true },
      });
      for (const d of scraped) refs.add(`scraped:${d.id}`);
    }

    return Array.from(refs);
  }
}
