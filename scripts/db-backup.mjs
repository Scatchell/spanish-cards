import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { composeTarget, repoRoot } from './compose-target.mjs';

const env = process.argv[2] ?? 'dev';
const { cwd, args } = composeTarget(env);

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
  `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const outDir = path.join(repoRoot, 'db-backups');
const outFile = path.join(outDir, `${env}-${stamp}.sql.gz`);
fs.mkdirSync(outDir, { recursive: true });

// pg_dump runs inside the postgres container with that container's own
// credentials, so no password is read or passed on the host.
const dump = spawn(
  'docker',
  [...args, 'exec', '-T', 'postgres', 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
  { cwd, stdio: ['ignore', 'pipe', 'inherit'] },
);
const out = fs.createWriteStream(outFile);
dump.stdout.pipe(createGzip()).pipe(out);

dump.on('close', (code) => {
  out.on('close', () => {
    if (code !== 0) {
      fs.rmSync(outFile, { force: true });
      console.error(`pg_dump failed (exit ${code}); no backup written`);
      process.exit(code ?? 1);
    }
    const bytes = fs.statSync(outFile).size;
    console.log(`Backup written: ${path.relative(repoRoot, outFile)} (${bytes} bytes)`);
  });
});
