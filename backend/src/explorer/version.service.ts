import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Asset, Prisma } from '@prisma/client';
import { ActivityService } from './activity.service';
import { Principal } from './permission.service';

export interface NewVersionInput {
  label?: string;
  sizeBytes?: number | bigint | null;
  checksum?: string;
  storageRef?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class VersionService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivityService,
  ) {}

  list(assetId: string) {
    return this.prisma.assetVersion.findMany({
      where: { assetId },
      orderBy: { versionNumber: 'desc' },
      include: { createdBy: { select: { email: true } } },
    });
  }

  private async nextNumber(assetId: string): Promise<number> {
    const last = await this.prisma.assetVersion.findFirst({
      where: { assetId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    return (last?.versionNumber ?? 0) + 1;
  }

  /** Record a new version (e.g. a re-upload or re-crawl snapshot). */
  async create(actor: Principal, asset: Asset, input: NewVersionInput) {
    const versionNumber = await this.nextNumber(asset.id);
    const version = await this.prisma.assetVersion.create({
      data: {
        assetId: asset.id,
        versionNumber,
        label: input.label,
        sizeBytes: input.sizeBytes != null ? BigInt(input.sizeBytes) : null,
        checksum: input.checksum,
        storageRef: input.storageRef,
        createdById: actor.id,
        metadata: input.metadata,
      },
    });
    this.activity.log(asset.workspaceId, actor.id, 'VERSION', asset.id, { versionNumber });
    return version;
  }

  /** Non-destructive rollback: snapshots the target version as a new current version. */
  async rollback(actor: Principal, asset: Asset, versionNumber: number) {
    const target = await this.prisma.assetVersion.findUnique({
      where: { assetId_versionNumber: { assetId: asset.id, versionNumber } },
    });
    if (!target) throw new NotFoundException(`Version ${versionNumber} not found`);

    const newNumber = await this.nextNumber(asset.id);
    const restored = await this.prisma.assetVersion.create({
      data: {
        assetId: asset.id,
        versionNumber: newNumber,
        label: `Rollback to v${versionNumber}`,
        sizeBytes: target.sizeBytes,
        checksum: target.checksum,
        storageRef: target.storageRef,
        createdById: actor.id,
        metadata: target.metadata as Prisma.InputJsonValue,
      },
    });
    // Reflect the restored content's size on the asset
    await this.prisma.asset.update({
      where: { id: asset.id },
      data: { sizeBytes: target.sizeBytes },
    });
    this.activity.log(asset.workspaceId, actor.id, 'ROLLBACK', asset.id, {
      restoredFrom: versionNumber, newVersion: newNumber,
    });
    return restored;
  }
}
