import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AssetService } from '../explorer/asset.service';
import { WorkspaceService } from '../explorer/workspace.service';
import { VersionService } from '../explorer/version.service';
import { TemplatesService } from '../templates/templates.service';

// Minimal file descriptor — avoids relying on Express.Multer global augmentation
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8001';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

interface ExtractionResult {
  text: string;
  title: string | null;
  author: string | null;
  language: string | null;
  pageCount: number | null;
}

interface NlpEntity {
  text: string;
  label: string;
  start: number;
  end: number;
}

interface NlpTable {
  title: string;
  columns: string[];
  rows: string[][];
}

interface NlpResult {
  summary: string | null;
  entities: NlpEntity[];
  keywords: string[];
  tables: NlpTable[];
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private assets: AssetService,
    private workspaces: WorkspaceService,
    private versions: VersionService,
    private templates: TemplatesService,
  ) {}

  async upload(
    file: MulterFile,
    userId: number,
    opts?: { templateId?: string; columns?: string[] },
  ) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, PPTX, XLSX, TXT`,
      );
    }

    const extraction = await this.extractText(file);
    const nlp = await this.analyzeNlp(extraction.text, extraction.language);

    // Resolve the table-extraction schema (template or manual columns)
    const columns = await this.templates.resolveColumns(opts?.templateId, opts?.columns);

    const doc = await this.prisma.uploadedDocument.create({
      data: {
        uploadedById: userId,
        filename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        extractedText: extraction.text,
        title: extraction.title,
        author: extraction.author,
        language: extraction.language,
        pageCount: extraction.pageCount,
        summary: nlp.summary,
        entities: nlp.entities as any,
        keywords: nlp.keywords,
        tables: [] as any, // filled asynchronously below
        templateId: opts?.templateId ?? null,
        tableColumns: columns ?? [],
      },
    });

    // Tables are extracted in the background (slow LLM stage) and patched in
    this.extractTablesInBackground('uploaded', doc.id, extraction.text, extraction.language, columns);

    this.activityLogsService
      .logActivity(userId, 'UPLOAD', `Uploaded document "${file.originalname}"`)
      .catch(() => {});

    // Register the document as a FILE asset in the unified explorer
    try {
      const ws = await this.workspaces.getOrCreateDefault(userId);
      const asset = await this.assets.createAsset({
        workspaceId: ws.id,
        ownerId: userId,
        parentId: null,
        type: 'FILE',
        name: doc.title || doc.filename,
        mimeType: doc.mimeType,
        sizeBytes: doc.fileSize,
        metadata: { uploadedDocumentId: doc.id, ref: `uploaded:${doc.id}` },
      });
      await this.prisma.uploadedDocument.update({
        where: { id: doc.id },
        data: { assetId: asset.id },
      });
      // Record the initial version (v1) of the file
      await this.versions.create({ id: userId, role: 'EXPERT' }, asset, {
        label: 'Initial upload',
        sizeBytes: doc.fileSize,
      });
    } catch (err) {
      this.logger.warn(`Failed to register asset for document ${doc.id}: ${err.message}`);
    }

    // Index in Qdrant for semantic search (fire-and-forget)
    fetch(`${SCRAPER_URL}/search/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_id: doc.id,
        type: 'uploaded',
        text: extraction.text,
        title: extraction.title ?? doc.filename,
        filename: doc.filename,
      }),
    }).catch(() => {});

    return doc;
  }

  /**
   * Run the (slow) LLM table extraction off the request path and patch the
   * document once it completes. `columns` forces a schema-guided extraction.
   */
  extractTablesInBackground(
    docType: 'uploaded' | 'scraped',
    docId: number,
    text: string,
    language: string | null,
    columns: string[] | null,
  ): void {
    (async () => {
      try {
        const res = await fetch(`${SCRAPER_URL}/nlp/tables`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(900_000),
          body: JSON.stringify({ text, language: language ?? 'en', columns: columns ?? undefined }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const tables = data.tables ?? [];
        if (docType === 'uploaded') {
          await this.prisma.uploadedDocument.update({ where: { id: docId }, data: { tables } });
        } else {
          await this.prisma.scrapedDocument.update({ where: { id: docId }, data: { tables } });
        }
        this.logger.log(`Tables extracted for ${docType} document ${docId}: ${tables.length} table(s)`);
      } catch (err) {
        this.logger.warn(`Background table extraction failed for ${docType} ${docId}: ${(err as Error).message}`);
      }
    })();
  }

  private async extractText(file: MulterFile): Promise<ExtractionResult> {
    try {
      // Send raw bytes — avoids Blob/FormData ArrayBuffer type incompatibilities
      const response = await fetch(`${SCRAPER_URL}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': file.mimetype,
          'X-Filename': encodeURIComponent(file.originalname),
        },
        body: file.buffer as unknown as BodyInit,
      });

      if (!response.ok) {
        this.logger.warn(`FastAPI /extract returned ${response.status} for "${file.originalname}"`);
        return { text: '', title: null, author: null, language: null, pageCount: null };
      }

      return await response.json();
    } catch (err) {
      this.logger.error(`Text extraction failed for "${file.originalname}": ${err.message}`);
      return { text: '', title: null, author: null, language: null, pageCount: null };
    }
  }

  private async analyzeNlp(text: string, language: string | null): Promise<NlpResult> {
    const empty: NlpResult = { summary: null, entities: [], keywords: [], tables: [] };
    if (!text?.trim()) return empty;

    try {
      const response = await fetch(`${SCRAPER_URL}/nlp/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Give the summarization model plenty of time on first load
        signal: AbortSignal.timeout(300_000),
        body: JSON.stringify({ text, language: language ?? 'en' }),
      });

      if (!response.ok) {
        this.logger.warn(`FastAPI /nlp/analyze returned ${response.status}`);
        return empty;
      }

      return await response.json();
    } catch (err) {
      this.logger.error(`NLP analysis failed: ${err.message}`);
      return empty;
    }
  }

  async findAll(userId: number, role: string) {
    const where =
      role === 'ADMIN' || role === 'DECISION_MAKER' ? {} : { uploadedById: userId };

    return this.prisma.uploadedDocument.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        fileSize: true,
        title: true,
        author: true,
        pageCount: true,
        language: true,
        uploadedAt: true,
        uploadedBy: { select: { email: true } },
      },
    });
  }

  async findOne(id: number, userId: number, role: string) {
    const doc = await this.prisma.uploadedDocument.findUnique({
      where: { id },
      include: { uploadedBy: { select: { email: true } } },
    });

    if (!doc) throw new NotFoundException('Document not found');
    if (role !== 'ADMIN' && doc.uploadedById !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return doc;
  }

  async delete(id: number, userId: number, role: string) {
    const doc = await this.prisma.uploadedDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (role !== 'ADMIN' && doc.uploadedById !== userId) {
      throw new ForbiddenException('You can only delete your own documents');
    }

    this.activityLogsService
      .logActivity(userId, 'DELETE', `Deleted document "${doc.filename}"`)
      .catch(() => {});

    return this.prisma.uploadedDocument.delete({ where: { id } });
  }
}
