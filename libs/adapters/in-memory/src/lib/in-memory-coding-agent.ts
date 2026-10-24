import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NO_TOKENS, type Implementation } from '@zenthos/domain';
import type { CodingAgentPort, ImplementInput } from '@zenthos/ports';

/** Coding agent that needs no model: writes one markdown file describing what it would do. */
export class InMemoryCodingAgent implements CodingAgentPort {
  async implement({ checkout, spec, feedback }: ImplementInput): Promise<Implementation> {
    const file = path.join(checkout.path, 'docs', 'zenthos-implementation.md');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      [
        `# ${spec.ticketKey}`,
        '',
        spec.problem,
        '',
        ...spec.acceptanceCriteria.map((c) => `- ${c.id}: ${c.statement}`),
        feedback ? `\nPrevious attempt feedback:\n${feedback}` : '',
      ].join('\n'),
    );
    return { summary: `Described ${spec.acceptanceCriteria.length} criteria in ${path.relative(checkout.path, file)}`, estimatedCostUsd: 0, tokens: NO_TOKENS };
  }
}
