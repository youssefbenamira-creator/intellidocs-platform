import { TemplatesService } from './templates.service';

/** Unit tests for template column handling and schema resolution. */
function mockPrisma() {
  return {
    documentTemplate: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 't1', ...data })),
    },
  } as any;
}

describe('TemplatesService.resolveColumns', () => {
  it('returns a template\'s columns when a templateId is given', async () => {
    const prisma = mockPrisma();
    prisma.documentTemplate.findUnique.mockResolvedValue({ id: 't1', columns: ['Coin', 'Price'] });
    const svc = new TemplatesService(prisma);
    expect(await svc.resolveColumns('t1', undefined)).toEqual(['Coin', 'Price']);
  });

  it('cleans manual columns (trim, dedup case-insensitively, drop empties)', async () => {
    const svc = new TemplatesService(mockPrisma());
    expect(await svc.resolveColumns(undefined, ['A', ' a ', 'B', '', '  ', 'b'])).toEqual(['A', 'B']);
  });

  it('returns null when neither a template nor columns are provided', async () => {
    const svc = new TemplatesService(mockPrisma());
    expect(await svc.resolveColumns(undefined, undefined)).toBeNull();
    expect(await svc.resolveColumns(undefined, [])).toBeNull();
  });
});

describe('TemplatesService.create', () => {
  it('rejects an empty name', async () => {
    const svc = new TemplatesService(mockPrisma());
    await expect(svc.create(1, { name: '  ', columns: ['A'] })).rejects.toThrow();
  });

  it('rejects when no valid columns remain after cleaning', async () => {
    const svc = new TemplatesService(mockPrisma());
    await expect(svc.create(1, { name: 'X', columns: ['', '  '] })).rejects.toThrow();
  });

  it('persists a cleaned, deduplicated column set', async () => {
    const prisma = mockPrisma();
    const svc = new TemplatesService(prisma);
    await svc.create(1, { name: 'Crypto', columns: ['Coin', 'coin', 'Price'] });
    expect(prisma.documentTemplate.create).toHaveBeenCalled();
    expect(prisma.documentTemplate.create.mock.calls[0][0].data.columns).toEqual(['Coin', 'Price']);
  });
});
