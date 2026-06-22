import { PermissionService } from './permission.service';

/**
 * Unit tests for the RBAC resolution that guards every explorer operation.
 * Prisma is mocked so these run without a database.
 */
function mockPrisma() {
  return {
    assetPermission: { findMany: jest.fn().mockResolvedValue([]) },
    workspaceMember: { findUnique: jest.fn().mockResolvedValue(null) },
    asset: { findUnique: jest.fn() },
  } as any;
}

const asset = (over: Partial<any> = {}) => ({
  id: 'child',
  path: '/root/child/',
  ownerId: 99,
  workspaceId: 'ws1',
  ...over,
});

describe('PermissionService.resolve', () => {
  it('grants OWNER to a platform ADMIN regardless of grants', async () => {
    const svc = new PermissionService(mockPrisma());
    expect(await svc.resolve({ id: 1, role: 'ADMIN' }, asset())).toBe('OWNER');
  });

  it('grants OWNER to the asset owner', async () => {
    const svc = new PermissionService(mockPrisma());
    expect(await svc.resolve({ id: 99, role: 'EXPERT' }, asset({ ownerId: 99 }))).toBe('OWNER');
  });

  it('returns null when the user has no grant anywhere', async () => {
    const svc = new PermissionService(mockPrisma());
    expect(await svc.resolve({ id: 7, role: 'DECISION_MAKER' }, asset())).toBeNull();
  });

  it('returns a direct grant on the asset', async () => {
    const prisma = mockPrisma();
    prisma.assetPermission.findMany.mockResolvedValue([{ level: 'EDITOR' }]);
    const svc = new PermissionService(prisma);
    expect(await svc.resolve({ id: 7, role: 'EXPERT' }, asset())).toBe('EDITOR');
  });

  it('inherits a grant from an ancestor folder (via materialized path)', async () => {
    const prisma = mockPrisma();
    // The query scope must include the ancestor "root"; we return a VIEWER grant
    prisma.assetPermission.findMany.mockResolvedValue([{ level: 'VIEWER' }]);
    const svc = new PermissionService(prisma);
    const a = asset();
    expect(await svc.resolve({ id: 7, role: 'EXPERT' }, a)).toBe('VIEWER');
    // ancestor ids passed to the query exclude the asset itself
    const where = prisma.assetPermission.findMany.mock.calls[0][0].where;
    expect(where.assetId.in).toEqual(['child', 'root']);
  });

  it('takes the highest of several applicable grants', async () => {
    const prisma = mockPrisma();
    prisma.assetPermission.findMany.mockResolvedValue([{ level: 'VIEWER' }, { level: 'OWNER' }]);
    const svc = new PermissionService(prisma);
    expect(await svc.resolve({ id: 7, role: 'EXPERT' }, asset())).toBe('OWNER');
  });

  it('uses workspace membership as a floor', async () => {
    const prisma = mockPrisma();
    prisma.workspaceMember.findUnique.mockResolvedValue({ level: 'EDITOR' });
    const svc = new PermissionService(prisma);
    expect(await svc.resolve({ id: 7, role: 'EXPERT' }, asset())).toBe('EDITOR');
  });
});

describe('PermissionService helpers', () => {
  it('ancestorIds parses the path and excludes self', () => {
    const svc = new PermissionService(mockPrisma());
    expect(svc.ancestorIds({ id: 'c', path: '/a/b/c/' })).toEqual(['a', 'b']);
    expect(svc.ancestorIds({ id: 'r', path: '/r/' })).toEqual([]);
  });

  it('assert throws when the resolved level is below what is needed', async () => {
    const prisma = mockPrisma();
    prisma.assetPermission.findMany.mockResolvedValue([{ level: 'VIEWER' }]);
    const svc = new PermissionService(prisma);
    await expect(svc.assert({ id: 7, role: 'EXPERT' }, asset(), 'EDITOR')).rejects.toThrow();
  });

  it('assert passes when the resolved level is sufficient', async () => {
    const prisma = mockPrisma();
    prisma.assetPermission.findMany.mockResolvedValue([{ level: 'OWNER' }]);
    const svc = new PermissionService(prisma);
    await expect(svc.assert({ id: 7, role: 'EXPERT' }, asset(), 'EDITOR')).resolves.toBeUndefined();
  });
});
