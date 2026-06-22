import {
  Injectable, NotFoundException, UnauthorizedException,
  HttpException, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Asset, PermissionLevel } from '@prisma/client';
import { ActivityService } from './activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Principal } from './permission.service';

@Injectable()
export class ShareService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivityService,
    private notifications: NotificationsService,
  ) {}

  // ── Internal sharing (Viewer / Editor / Owner) ─────────────────────────

  listPermissions(assetId: string) {
    return this.prisma.assetPermission.findMany({
      where: { assetId },
      include: { user: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Resolve a user id from an email; throws if not found. */
  async resolveUserId(email: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    if (!user) throw new NotFoundException(`No user with email "${email}"`);
    return user.id;
  }

  async grant(actor: Principal, asset: Asset, userId: number, level: PermissionLevel) {
    if (userId === asset.ownerId) {
      throw new BadRequestException('The owner already has full access');
    }
    const perm = await this.prisma.assetPermission.upsert({
      where: { assetId_userId: { assetId: asset.id, userId } },
      create: { assetId: asset.id, userId, level, grantedById: actor.id },
      update: { level, grantedById: actor.id },
      include: { user: { select: { email: true, role: true } } },
    });
    this.activity.log(asset.workspaceId, actor.id, 'PERMISSION_CHANGE', asset.id, { userId, level });

    // Point the notification at the recipient's own explorer (role-specific portal)
    const portal =
      perm.user.role === 'ADMIN' ? '/admin'
      : perm.user.role === 'DECISION_MAKER' ? '/decision-maker'
      : '/expert';
    this.notifications.create(userId, {
      title: 'A document was shared with you',
      message: `"${asset.name}" was shared with you (${level.toLowerCase()})`,
      link: `${portal}/explorer`,
    });
    return perm;
  }

  async revoke(actor: Principal, asset: Asset, userId: number) {
    await this.prisma.assetPermission.deleteMany({ where: { assetId: asset.id, userId } });
    this.activity.log(asset.workspaceId, actor.id, 'UNSHARE', asset.id, { userId });
    return { revoked: true };
  }

  // ── Public links (read-only, optional password + expiry) ───────────────

  async listPublicLinks(assetId: string) {
    const links = await this.prisma.assetShare.findMany({
      where: { assetId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((l) => this.sanitize(l));
  }

  async createPublicLink(
    actor: Principal,
    asset: Asset,
    opts: { password?: string; expiresAt?: string },
  ) {
    const token = randomBytes(24).toString('base64url');
    const passwordHash = opts.password ? await bcrypt.hash(opts.password, 10) : null;
    const expiresAt = opts.expiresAt ? new Date(opts.expiresAt) : null;
    if (expiresAt && isNaN(expiresAt.getTime())) {
      throw new BadRequestException('Invalid expiresAt date');
    }
    const link = await this.prisma.assetShare.create({
      data: { assetId: asset.id, token, passwordHash, expiresAt, createdById: actor.id },
    });
    this.activity.log(asset.workspaceId, actor.id, 'PUBLIC_LINK', asset.id, {
      hasPassword: !!passwordHash, expiresAt,
    });
    return this.sanitize(link);
  }

  async revokePublicLink(actor: Principal, asset: Asset, shareId: string) {
    const link = await this.prisma.assetShare.findUnique({ where: { id: shareId } });
    if (!link || link.assetId !== asset.id) throw new NotFoundException('Share link not found');
    await this.prisma.assetShare.update({ where: { id: shareId }, data: { revokedAt: new Date() } });
    this.activity.log(asset.workspaceId, actor.id, 'UNSHARE', asset.id, { shareId, public: true });
    return { revoked: true };
  }

  /** Unauthenticated resolution of a public link → read-only asset view. */
  async resolvePublic(token: string, password?: string) {
    const link = await this.prisma.assetShare.findUnique({
      where: { token },
      include: { asset: true },
    });
    if (!link || link.revokedAt) throw new NotFoundException('Link not found or revoked');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new HttpException('This link has expired', HttpStatus.GONE);
    }
    if (link.passwordHash) {
      if (!password) throw new UnauthorizedException('Password required');
      const ok = await bcrypt.compare(password, link.passwordHash);
      if (!ok) throw new UnauthorizedException('Invalid password');
    }

    const asset = link.asset;
    let detail: any = null;
    if (asset.type === 'FILE' || asset.type === 'GENERATED_DOCUMENT') {
      detail = await this.prisma.uploadedDocument.findFirst({
        where: { assetId: asset.id },
        select: { title: true, summary: true, tables: true, mimeType: true },
      });
    } else if (asset.type === 'SCRAPED_PAGE') {
      detail = await this.prisma.scrapedDocument.findFirst({
        where: { assetId: asset.id },
        select: { title: true, url: true, summary: true, tables: true },
      });
    }

    return {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      createdAt: asset.createdAt,
      readOnly: true,
      requiresPassword: !!link.passwordHash,
      detail,
    };
  }

  private sanitize(link: { id: string; token: string; expiresAt: Date | null; passwordHash: string | null; createdAt: Date; revokedAt: Date | null }) {
    return {
      id: link.id,
      token: link.token,
      url: `/public/${link.token}`,
      hasPassword: !!link.passwordHash,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      revokedAt: link.revokedAt,
    };
  }
}
