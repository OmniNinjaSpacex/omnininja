import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  throw new Error('Next.js standalone output was not created.');
}

mkdirSync(join(standalone, '.next'), { recursive: true });
cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), {
  recursive: true,
  force: true,
});

if (existsSync(join(root, 'public'))) {
  cpSync(join(root, 'public'), join(standalone, 'public'), {
    recursive: true,
    force: true,
  });
}
