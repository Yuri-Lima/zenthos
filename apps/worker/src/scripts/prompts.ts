/**
 * Publishes the agents' system prompts to LangFuse (ADR 016): `pnpm nx run @zenthos/worker:prompts-publish`.
 * Each prompt version (`spec-writer/v1`) becomes the LangFuse prompt `spec-writer` with the label `v1`. Text already
 * there under that label is left alone; different text under the same label fails, because a wording change must
 * bump the version so traces, evals and baselines keep meaning one prompt.
 */
import { execFileSync } from 'node:child_process';
import { LangfuseClient } from '@langfuse/client';
import { PUBLISHED_PROMPTS, promptAddress } from '@zenthos/agents';
import { loadWorkerConfig } from '../composition.js';

const config = loadWorkerConfig();
if (!config.LANGFUSE_PUBLIC_KEY || !config.LANGFUSE_SECRET_KEY) throw new Error('set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to publish prompts');
const client = new LangfuseClient({ publicKey: config.LANGFUSE_PUBLIC_KEY, secretKey: config.LANGFUSE_SECRET_KEY, baseUrl: config.LANGFUSE_BASE_URL });
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const isNotFound = (error: unknown) => (error as { statusCode?: number }).statusCode === 404;

try {
  for (const { version, text } of PUBLISHED_PROMPTS) {
    const { name, label } = promptAddress(version);
    const existing = await client.prompt.get(name, { label, type: 'text', cacheTtlSeconds: 0 }).catch((error: unknown) => {
      if (isNotFound(error)) return undefined;
      throw error;
    });
    if (existing && existing.prompt === text) {
      console.log(`${version}: unchanged (LangFuse version ${existing.version})`);
    } else if (existing) {
      throw new Error(`${version}: the text differs from what LangFuse holds under this label; bump the version in libs/agents before changing a prompt`);
    } else {
      const created = await client.prompt.create({ name, prompt: text, labels: [label], commitMessage: `${version} at ${commit}` });
      console.log(`${version}: published as LangFuse version ${created.version}`);
    }
  }
} finally {
  await client.shutdown();
}
