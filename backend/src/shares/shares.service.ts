import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateShareDto } from './dto/create-share.dto';

@Injectable()
export class SharesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async createShares(sharedById: number, dto: CreateShareDto) {
    const { documentId, documentType, sharedWithIds, message } = dto;

    if (!['uploaded', 'scraped'].includes(documentType)) {
      throw new BadRequestException('documentType must be "uploaded" or "scraped"');
    }

    // Verify document exists
    let docTitle = '';
    if (documentType === 'uploaded') {
      const doc = await this.prisma.uploadedDocument.findUnique({
        where: { id: documentId },
        select: { title: true, filename: true },
      });
      if (!doc) throw new NotFoundException('Document not found');
      docTitle = doc.title || doc.filename;
    } else {
      const doc = await this.prisma.scrapedDocument.findUnique({
        where: { id: documentId },
        select: { title: true, url: true },
      });
      if (!doc) throw new NotFoundException('Document not found');
      docTitle = doc.title || doc.url;
    }

    const sharer = await this.prisma.user.findUnique({
      where: { id: sharedById },
      select: { email: true },
    });

    const results: any[] = [];
    for (const sharedWithId of sharedWithIds) {
      const recipient = await this.prisma.user.findUnique({
        where: { id: sharedWithId },
        select: { id: true, email: true, role: true },
      });
      if (!recipient) continue;

      const share = await this.prisma.documentShare.upsert({
        where: {
          documentId_documentType_sharedWithId: { documentId, documentType, sharedWithId },
        },
        create: { documentId, documentType, sharedById, sharedWithId, message },
        update: { message, sharedById },
        include: { sharedWith: { select: { email: true, role: true } } },
      });
      results.push(share);

      // Determine notification link based on recipient role
      let link: string;
      if (recipient.role === 'DECISION_MAKER') {
        link = '/decision-maker/documents';
      } else if (recipient.role === 'EXPERT') {
        link = documentType === 'uploaded'
          ? `/expert/library/${documentId}`
          : `/expert/documents/${documentId}`;
      } else {
        link = '/admin/documents';
      }

      await this.notificationsService.create(sharedWithId, {
        title: 'Document shared with you',
        message: message
          ? `"${docTitle}" — ${message}`
          : `"${docTitle}" was shared with you by ${sharer?.email ?? 'Admin'}`,
        link,
      });
    }

    return results;
  }

  async getReceivedShares(userId: number) {
    const shares = await this.prisma.documentShare.findMany({
      where: { sharedWithId: userId },
      orderBy: { createdAt: 'desc' },
      include: { sharedBy: { select: { email: true } } },
    });

    return Promise.all(
      shares.map(async (share) => {
        let document: any = null;
        if (share.documentType === 'uploaded') {
          document = await this.prisma.uploadedDocument.findUnique({
            where: { id: share.documentId },
            select: { id: true, filename: true, title: true, mimeType: true, fileSize: true, uploadedAt: true, tables: true },
          });
        } else {
          document = await this.prisma.scrapedDocument.findUnique({
            where: { id: share.documentId },
            select: { id: true, title: true, url: true, description: true, scrapedAt: true, tables: true },
          });
        }
        return { ...share, document };
      }),
    );
  }

  async getAllShares() {
    const shares = await this.prisma.documentShare.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        sharedBy:   { select: { email: true } },
        sharedWith: { select: { id: true, email: true, role: true } },
      },
    });

    return Promise.all(
      shares.map(async (share) => {
        let docLabel = '';
        if (share.documentType === 'uploaded') {
          const d = await this.prisma.uploadedDocument.findUnique({
            where: { id: share.documentId },
            select: { title: true, filename: true },
          });
          docLabel = d?.title || d?.filename || `Doc #${share.documentId}`;
        } else {
          const d = await this.prisma.scrapedDocument.findUnique({
            where: { id: share.documentId },
            select: { title: true, url: true },
          });
          docLabel = d?.title || d?.url || `Doc #${share.documentId}`;
        }
        return { ...share, docLabel };
      }),
    );
  }

  async getDocumentShares(documentId: number, documentType: string) {
    return this.prisma.documentShare.findMany({
      where: { documentId, documentType },
      include: { sharedWith: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeShare(id: number) {
    const share = await this.prisma.documentShare.findUnique({ where: { id } });
    if (!share) throw new NotFoundException('Share not found');
    await this.prisma.documentShare.delete({ where: { id } });
    return { success: true };
  }

  async getShareableUsers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, role: true },
      orderBy: { email: 'asc' },
    });
  }
}
