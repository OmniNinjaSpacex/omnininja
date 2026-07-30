import { db } from '../src/lib/db';
import crypto from 'crypto';

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const email = 'admin@omninja.app';
  await db.user.deleteMany({ where: { email } }).catch(() => {});
  const admin = await db.user.create({
    data: {
      email,
      name: 'Admin OmniNinja',
      passwordHash: hashPassword('omnininja-admin-2026'),
      tier: 'enterprise',
      credits: 999999999,
      bonusCredits: 999999999,
      role: 'admin',
      defaultModel: 'claude',
    },
  });
  console.log('✅ Admin criado:', admin.email, '| role:', admin.role, '| créditos: ∞');
}

main().then(() => process.exit(0)).catch(e => { console.error('❌', e); process.exit(1); });
