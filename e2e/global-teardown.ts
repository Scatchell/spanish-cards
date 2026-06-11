import { execSync } from 'node:child_process';
import { E2E_COMPOSE_ARGS } from './env.js';

const docker = ['docker', ...E2E_COMPOSE_ARGS].join(' ');

export default async function globalTeardown(): Promise<void> {
  execSync(`${docker} down -v --remove-orphans`, { stdio: 'inherit' });
}
