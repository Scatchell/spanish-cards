import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { composeTarget, repoRoot } from './compose-target.mjs';

const env = process.argv[2] ?? 'dev';
const { cwd, args } = composeTarget(env);
const sql = fs.readFileSync(path.join(repoRoot, 'scripts/verify-user-migration.sql'));

const psql = spawn(
  'docker',
  [...args, 'exec', '-T', 'postgres', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'],
  { cwd, stdio: ['pipe', 'inherit', 'inherit'] },
);
psql.stdin.end(sql);
psql.on('close', (code) => process.exit(code ?? 1));
