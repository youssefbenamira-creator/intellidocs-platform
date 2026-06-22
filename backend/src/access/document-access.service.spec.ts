import { DocumentAccessService } from './document-access.service';

/**
 * Unit tests for the RBAC ref-scoping that constrains semantic retrieval:
 *   ADMIN → null (unrestricted), EXPERT → own + shared, DECISION_MAKER → shared only.
 */
function mockPrisma() {
  return {
    documentShare: { findMany: jest.fn().mockResolvedValue([]) },
    uploadedDocument: { findMany: jest.fn().mockResolvedValue([]) },
    scrapedDocument: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('DocumentAccessService.getAccessibleRefs', () => {
  it('returns null (no restriction) for ADMIN', async () => {
    const svc = new DocumentAccessService(mockPrisma());
    expect(await svc.getAccessibleRefs(1, 'ADMIN')).toBeNull();
  });

  it('returns only shared refs for a DECISION_MAKER', async () => {
    const prisma = mockPrisma();
    prisma.documentShare.findMany.mockResolvedValue([
      { documentId: 4, documentType: 'scraped' },
      { documentId: 7, documentType: 'uploaded' },
    ]);
    const svc = new DocumentAccessService(prisma);
    const refs = await svc.getAccessibleRefs(3, 'DECISION_MAKER');
    expect(refs!.sort()).toEqual(['scraped:4', 'uploaded:7']);
    // a DM never queries its own documents
    expect(prisma.uploadedDocument.findMany).not.toHaveBeenCalled();
    expect(prisma.scrapedDocument.findMany).not.toHaveBeenCalled();
  });

  it('returns own + shared refs for an EXPERT, deduplicated', async () => {
    const prisma = mockPrisma();
    prisma.documentShare.findMany.mockResolvedValue([{ documentId: 9, documentType: 'uploaded' }]);
    prisma.uploadedDocument.findMany.mockResolvedValue([{ id: 7 }, { id: 9 }]); // 9 also shared
    prisma.scrapedDocument.findMany.mockResolvedValue([{ id: 4 }]);
    const svc = new DocumentAccessService(prisma);
    const refs = await svc.getAccessibleRefs(2, 'EXPERT');
    expect(refs!.sort()).toEqual(['scraped:4', 'uploaded:7', 'uploaded:9']);
  });

  it('returns an empty list (no access) when nothing is shared or owned', async () => {
    const svc = new DocumentAccessService(mockPrisma());
    expect(await svc.getAccessibleRefs(3, 'DECISION_MAKER')).toEqual([]);
  });
});
