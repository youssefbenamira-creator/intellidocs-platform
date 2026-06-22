import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface TemplateInput {
  name: string;
  description?: string;
  columns: string[];
  workspaceId?: string;
}

/**
 * Reusable table-extraction schemas ("templates"). A template is a named,
 * ordered set of columns; documents tagged with the same template are extracted
 * against identical columns, so similar documents yield comparable tables.
 */
@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  private clean(columns: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of columns ?? []) {
      const v = String(c).trim();
      if (v && !seen.has(v.toLowerCase())) {
        seen.add(v.toLowerCase());
        out.push(v);
      }
    }
    return out.slice(0, 20);
  }

  list(userId: number) {
    return this.prisma.documentTemplate.findMany({
      where: { ownerId: userId },
      orderBy: { name: 'asc' },
    });
  }

  async create(userId: number, dto: TemplateInput) {
    const columns = this.clean(dto.columns);
    if (!dto.name?.trim()) throw new BadRequestException('A template name is required');
    if (columns.length === 0) throw new BadRequestException('At least one column is required');
    return this.prisma.documentTemplate.create({
      data: {
        ownerId: userId,
        workspaceId: dto.workspaceId,
        name: dto.name.trim(),
        description: dto.description,
        columns,
      },
    });
  }

  private async owned(id: string, userId: number) {
    const tpl = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    if (tpl.ownerId !== userId) throw new ForbiddenException('Not your template');
    return tpl;
  }

  async update(id: string, userId: number, dto: Partial<TemplateInput>) {
    await this.owned(id, userId);
    return this.prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.columns !== undefined ? { columns: this.clean(dto.columns) } : {}),
      },
    });
  }

  async remove(id: string, userId: number) {
    await this.owned(id, userId);
    await this.prisma.documentTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Consolidated dataset: stack the rows of every document extracted against a
   * template into one table, so N similar documents become a single dataset.
   */
  async dataset(id: string, userId: number) {
    const tpl = await this.owned(id, userId);
    const sig = tpl.columns.map((c) => c.toLowerCase()).join('||');

    const uploaded = await this.prisma.uploadedDocument.findMany({
      where: { templateId: id },
      select: { id: true, title: true, filename: true, tables: true },
    });
    const scraped = await this.prisma.scrapedDocument.findMany({
      where: { templateId: id },
      select: { id: true, title: true, url: true, tables: true },
    });

    const rows: { cells: string[]; sourceType: string; sourceId: number; sourceTitle: string }[] = [];
    const collect = (tables: any, sourceType: string, sourceId: number, sourceTitle: string) => {
      if (!Array.isArray(tables)) return;
      for (const t of tables) {
        const cols: string[] = t?.columns ?? [];
        if (cols.map((c) => String(c).toLowerCase()).join('||') !== sig) continue;
        for (const r of t.rows ?? []) rows.push({ cells: r, sourceType, sourceId, sourceTitle });
      }
    };
    for (const d of uploaded) collect(d.tables, 'uploaded', d.id, d.title || d.filename);
    for (const d of scraped) collect(d.tables, 'scraped', d.id, d.title || d.url);

    return {
      name: tpl.name,
      columns: tpl.columns,
      rows,
      documentCount: uploaded.length + scraped.length,
    };
  }

  /** Resolve the column set to use for extraction, from a template id or explicit columns. */
  async resolveColumns(templateId?: string | null, columns?: string[] | null): Promise<string[] | null> {
    if (templateId) {
      const tpl = await this.prisma.documentTemplate.findUnique({ where: { id: templateId } });
      if (tpl) return tpl.columns;
    }
    if (columns && columns.length) return this.clean(columns);
    return null;
  }
}
