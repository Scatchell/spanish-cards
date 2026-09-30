import { spawnSync } from 'node:child_process';
import { composeTarget } from './compose-target.mjs';

// Runs the users CLI inside the running prod app container, which already has
// the prod DATABASE_URL and APP_BASE_URL. Nothing secret is read on the host.
const [command, email] = process.argv.slice(2);
if (!command || !email) {
  console.error('Usage: node scripts/prod-user.mjs <invite|reset-link> <email>');
  process.exit(1);
}
const { cwd, args } = composeTarget('prod');
const result = spawnSync(
  'docker',
  [...args, 'exec', '-T', 'app', 'node', 'server/dist/cli/users.js', command, email],
  { cwd, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
