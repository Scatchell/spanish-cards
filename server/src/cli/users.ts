import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { normalizeEmail } from '../users/email.js';
import { UserAdminError, inviteUser, issueResetLink } from '../users/invites.js';

// Operator CLI, run on beast (dev: pnpm user:invite / user:reset-link; prod:
// the :prod variants run this inside the app container).
const USAGE = 'Usage: users <invite|reset-link> <email>';

async function main(): Promise<number> {
  const [command, email] = process.argv.slice(2);
  if ((command !== 'invite' && command !== 'reset-link') || !email) {
    console.error(USAGE);
    return 1;
  }
  const config = loadConfig();
  if (config.isProduction && !process.env.APP_BASE_URL?.trim()) {
    console.error('Warning: APP_BASE_URL is not set; links will use the default origin.');
  }
  const pool = createPool(config.databaseUrl);
  try {
    const link =
      command === 'invite'
        ? await inviteUser(pool, email, config.appBaseUrl)
        : await issueResetLink(pool, email, config.appBaseUrl);
    const validity = command === 'invite' ? '7 days' : '1 hour';
    console.log(`Set-password link for ${normalizeEmail(email)} (valid ${validity}, single use):\n${link}`);
    return 0;
  } catch (err) {
    if (err instanceof UserAdminError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  } finally {
    await pool.end();
  }
}

process.exitCode = await main();
