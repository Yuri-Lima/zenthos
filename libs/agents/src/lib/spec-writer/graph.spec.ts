import { RunnableLambda } from '@langchain/core/runnables';
import { DomainError, type Ticket } from '@zenthos/domain';
import { specWriterContract } from '@zenthos/ports';
import { LangGraphSpecWriter } from './graph.js';

const ticket: Ticket = {
  key: 'owner/repo#9',
  title: 'Sort the list by date',
  body: 'Newest first',
  url: 'https://github.com/owner/repo/issues/9',
  labels: [],
};

const validDraft = {
  problem: 'Users cannot sort the list by date',
  inScope: ['sort control on the list'],
  acceptanceCriteria: [{ id: 'AC-1', statement: 'Rows are ordered newest first by default', testHint: 'Playwright: read first row' }],
  touchedAreas: ['src/routes/list'],
};

/** A stand-in for `model.withStructuredOutput(SpecSchema)`: returns the queued drafts in order. */
function modelReturning(...drafts: unknown[]) {
  const calls: string[] = [];
  const model = RunnableLambda.from(async (messages: unknown) => {
    calls.push(JSON.stringify(messages));
    return drafts.shift();
  });
  return { model, calls };
}

describe('LangGraphSpecWriter', () => {
  for (const [name, check] of Object.entries(specWriterContract)) {
    it(name, () => check({ port: new LangGraphSpecWriter(modelReturning(validDraft)), ticket }));
  }

  it('feeds schema errors back and accepts the corrected draft', async () => {
    const { model, calls } = modelReturning({ problem: 'too short' }, validDraft);
    const { spec, estimatedCostUsd } = await new LangGraphSpecWriter({ model }).draftSpec({ ticket, repoContext: '' });
    expect(estimatedCostUsd).toBe(0);
    expect(spec.ticketKey).toBe(ticket.key);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('previous draft was rejected');
  });

  it('gives up after maxAttempts with invalid_spec', async () => {
    const { model } = modelReturning({}, {}, {});
    await expect(
      new LangGraphSpecWriter({ model, maxAttempts: 2 }).draftSpec({ ticket, repoContext: '' }),
    ).rejects.toMatchObject({ code: 'invalid_spec', context: { attempts: 2 } } satisfies Partial<DomainError>);
  });
});
