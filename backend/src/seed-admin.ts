import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://pfe_user:pfe_password@localhost:5435/pfe_db?schema=public' });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const email = 'zeff753@gmail.com';
  const password = '03121999';
  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hash, role: 'ADMIN' },
    create: {
      email,
      password: hash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('Admin user secured:', user.email);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
