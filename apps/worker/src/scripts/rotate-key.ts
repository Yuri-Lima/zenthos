/**
 * Re-seals every stored connection under a new deployment key (ADR 010). Run with the current key in
 * ZENTHOS_SECRETS_KEY and the new one in ZENTHOS_SECRETS_KEY_NEXT; afterwards set ZENTHOS_SECRETS_KEY to
 * the new value for the API and the worker and restart them. The old key opens nothing once this ran.
 *
 *   ZENTHOS_SECRETS_KEY_NEXT=$(openssl rand -hex 32) pnpm nx run @zenthos/worker:rotate-key
 */
import { rotateSecrets, SecretBox } from '@zenthos/adapter-postgres';
import pg from 'pg';
import { loadWorkerConfig } from '../composition.js';

const config = loadWorkerConfig();
const next = process.env['ZENTHOS_SECRETS_KEY_NEXT'];
if (!config.DATABASE_URL || !config.ZENTHOS_SECRETS_KEY || !next) {
  console.error('needs DATABASE_URL, ZENTHOS_SECRETS_KEY (current) and ZENTHOS_SECRETS_KEY_NEXT (new, openssl rand -hex 32)');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
try {
  const count = await rotateSecrets(pool, new SecretBox(config.ZENTHOS_SECRETS_KEY), new SecretBox(next));
  console.log(`${count} connection(s) re-sealed; set ZENTHOS_SECRETS_KEY to the new value for the API and the worker, then restart them`);
} finally {
  await pool.end();
}
