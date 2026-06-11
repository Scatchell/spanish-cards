import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const prodDir = process.env.PROD_COMPOSE_DIR ?? '/srv/containers/sideProjects/spanish-cards';
const envFile = process.env.PROD_COMPOSE_ENV_FILE ?? '.prod-env';

function requireFile(filePath, description) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${description}: ${filePath}`);
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: prodDir,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

requireFile(prodDir, 'production compose directory');
requireFile(path.join(prodDir, 'docker-compose.yml'), 'production docker-compose.yml');
requireFile(path.join(prodDir, envFile), 'production Compose env file');

const composeArgs = ['compose', '--profile', 'app', '--env-file', envFile];

console.log(`Deploying spanish-cards from ${prodDir}`);
run('docker', [...composeArgs, 'config', '--quiet']);
run('docker', [...composeArgs, 'up', '--build', '-d', '--wait', '--wait-timeout', '120']);
run('docker', [...composeArgs, 'ps']);
