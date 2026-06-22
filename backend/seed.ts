import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://pfe_user:pfe_password@db:5432/pfe_db?schema=public',
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = [
    { email: 'admin@pfe.com',    password: 'admin123',    role: 'ADMIN'          as const },
    { email: 'expert@pfe.com',   password: 'expert123',   role: 'EXPERT'         as const },
    { email: 'decision@pfe.com', password: 'decision123', role: 'DECISION_MAKER' as const },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where:  { email: u.email },
      update: {},
      create: { email: u.email, password: hash, role: u.role },
    });
    console.log(`✓ ${user.role}: ${user.email}  (password: ${u.password})`);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
