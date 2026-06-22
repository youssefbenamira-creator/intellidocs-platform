import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

export type AssetAction =
  | 'CREATE' | 'UPLOAD' | 'SCRAPE' | 'UPDATE' | 'RENAME' | 'MOVE' | 'COPY'
  | 'TRASH' | 'RESTORE' | 'PURGE' | 'SHARE' | 'UNSHARE'
  | 'PERMISSION_CHANGE' | 'PUBLIC_LINK' | 'VERSION' | 'ROLLBACK';

/**
 * Append-only audit trail for every asset operation. Failures here must never
 * break the underlying operation, so logging is best-effort. Each entry is also
 * mirrored into the platform-wide ActivityLog so it appears in the admin logs.
 */
@Injectable()
export class ActivityService {
  constructor(
    private prisma: PrismaService,
    private legacy: ActivityLogsService,
  ) {}

  log(
    workspaceId: string,
    actorId: number,
    action: AssetAction,
    assetId: string | null,
    detail?: Record<string, unknown>,
  ): void {
    this.prisma.assetActivity
      .create({ data: { workspaceId, actorId, action, assetId, detail: detail as any } })
      .catch(() => {});

    // Mirror into the platform-wide activity log (shown on the admin Logs page)
    const label =
      (detail?.name as string) ||
      (detail?.to as string) ||
      (detail?.id as string) ||
      assetId ||
      '';
    this.legacy
      .logActivity(actorId, `EXPLORER_${action}`, `Explorer: ${action.toLowerCase()}${label ? ` — ${label}` : ''}`)
      .catch(() => {});
  }

  list(workspaceId: string, assetId?: string, take = 100) {
    return this.prisma.assetActivity.findMany({
      where: { workspaceId, ...(assetId ? { assetId } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      include: { actor: { select: { email: true } } },
    });
  }
}
