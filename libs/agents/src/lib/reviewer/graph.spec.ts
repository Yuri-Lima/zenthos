import { RunnableLambda } from '@langchain/core/runnables';
import { repoProfile, type Spec } from '@zenthos/domain';
import { reviewerContract, type ReviewInput } from '@zenthos/ports';
import { LangGraphReviewer } from './graph.js';
import { DIFF_CHAR_BUDGET, reviewContext } from './prompt.js';

const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'staging', allowedCommands: [], gateCommands: [] });
const spec: Spec = { ticketKey: 'owner/repo#1', problem: 'Users cannot export the list', inScope: ['export'], outOfScope: ['PDF'], acceptanceCriteria: [{ id: 'AC-1', statement: 'Export downloads a CSV', testHint: 'Playwright' }], touchedAreas: ['src/export'], risks: [] };
const input: ReviewInput = { spec, profile, gates: [{ gate: 'ci', passed: true }], diff: { files: ['src/export.ts'], changedLines: 10, patch: 'diff --git a/src/export.ts b/src/export.ts\n+export const csv = 1;' } };

function fakeModels() {
  const prompts: string[] = [];
  return {
    prompts,
    models: {
      score: RunnableLambda.from(async (messages: unknown) => {
        prompts.push(JSON.stringify(messages));
        return { score: 4, evidence: 'src/export.ts:1 does what AC-1 asks' };
      }),
      findings: RunnableLambda.from(async () => ({ findings: [{ file: 'src/export.ts', line: 1, severity: 'minor', message: 'Name the constant' }], summary: 'Small change that matches the spec.' })),
    },
  };
}

describe('LangGraphReviewer', () => {
  for (const [name, check] of Object.entries(reviewerContract)) {
    it(name, () => check({ port: new LangGraphReviewer({ models: fakeModels().models }), spec, profile }));
  }

  it('scores each rubric line once, in parallel, and merges them with the findings', async () => {
    const { models, prompts } = fakeModels();
    const review = await new LangGraphReviewer({ models }).review(input);
    expect(prompts).toHaveLength(4);
    expect(prompts.some((p) => p.includes('correctness'))).toBe(true);
    expect(prompts.some((p) => p.includes('engineering rules'))).toBe(true);
    expect(review.scores.correctness.score).toBe(4);
    expect(review.findings[0].severity).toBe('minor');
    expect(review.summary).toContain('matches the spec');
  });

  it('cuts an oversized diff and says so', () => {
    const big = { ...input, diff: { ...input.diff, patch: 'x'.repeat(DIFF_CHAR_BUDGET + 10) } };
    expect(reviewContext(big)).toContain(`diff cut after ${DIFF_CHAR_BUDGET} characters`);
  });

  it('rejects a review whose scores or findings do not match the schema', async () => {
    const { models } = fakeModels();
    const broken = { ...models, findings: RunnableLambda.from(async () => ({ findings: [], summary: 'short' })) };
    await expect(new LangGraphReviewer({ models: broken }).review(input)).rejects.toMatchObject({ code: 'invalid_review' });
  });
});
