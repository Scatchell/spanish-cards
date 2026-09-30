import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prodDir = process.env.PROD_COMPOSE_DIR ?? '/srv/containers/sideProjects/spanish-cards';

// Where and how to run `docker compose` for an environment. Compose reads the
// env file itself, so these scripts never read secrets on the host.
export function composeTarget(env) {
  if (env === 'dev') {
    return { cwd: repoRoot, args: ['compose', '--env-file', '.dev-env'] };
  }
  if (env === 'prod') {
    return { cwd: prodDir, args: ['compose', '--profile', 'app', '--env-file', '.prod-env'] };
  }
  console.error(`Unknown environment "${env}" (expected dev or prod)`);
  process.exit(1);
}

export { repoRoot };
