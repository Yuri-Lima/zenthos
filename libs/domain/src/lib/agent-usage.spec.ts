import { NO_TOKENS } from './implementation.js';
import { addAgentUsage, compareWithTraces, roleOfTraceVersion, traceSessionId } from './agent-usage.js';

const usage = (estimatedCostUsd: number) => ({ tokens: { ...NO_TOKENS, inputTokens: 100 }, estimatedCostUsd });

describe('agent usage', () => {
  it('adds per agent and maps trace versions to the agents LangFuse sees', () => {
    const twice = addAgentUsage(addAgentUsage({}, 'reviewer', usage(1)), 'reviewer', usage(0.5));
    expect(twice.reviewer).toEqual({ tokens: { ...NO_TOKENS, inputTokens: 200 }, estimatedCostUsd: 1.5 });
    expect(roleOfTraceVersion('spec-writer/v1')).toBe('spec_writer');
    expect(roleOfTraceVersion('reviewer/v2')).toBe('reviewer');
    expect(roleOfTraceVersion('coding-agent/v1')).toBe('coding_agent');
    expect(roleOfTraceVersion('zenthos-probe')).toBeUndefined();
    expect([traceSessionId('o/r#1'), traceSessionId('o/r#1', 'eval'), traceSessionId('o/r#1', 'manual')]).toEqual(['o/r#1', 'eval:o/r#1', 'manual:o/r#1']);
  });

  it('matches within 5% or one cent, and says when a side is missing', () => {
    const compared = compareWithTraces({ spec_writer: usage(0.56), reviewer: usage(1) }, { spec_writer: { estimatedCostUsd: 0.5596, totalTokens: 79220 }, reviewer: { estimatedCostUsd: 0.7155, totalTokens: 119938 } });
    expect(compared.map((c) => [c.agent, c.verdict])).toEqual([['spec_writer', 'match'], ['coding_agent', 'not_recorded'], ['reviewer', 'mismatch']]);
    expect(compareWithTraces({}, { reviewer: { estimatedCostUsd: 1, totalTokens: 1 } }).map((c) => c.verdict)).toEqual(['not_recorded', 'not_recorded', 'not_recorded']);
    expect(compareWithTraces({ coding_agent: usage(5.04) }, { coding_agent: { estimatedCostUsd: 5.1, totalTokens: 900_000 } })[1].verdict).toBe('match');
    expect(compareWithTraces({ reviewer: usage(0.004) }, {}).map((c) => c.verdict)).toEqual(['not_recorded', 'not_recorded', 'not_traced']);
    expect(compareWithTraces({ reviewer: usage(0.004) }, { reviewer: { estimatedCostUsd: 0.012, totalTokens: 9 } })[2].verdict).toBe('match');
  });
});
