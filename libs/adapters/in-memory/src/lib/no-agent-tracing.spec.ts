import { agentTracingContract } from '@zenthos/ports';
import { NoAgentTracing } from './no-agent-tracing.js';

describe('NoAgentTracing', () => {
  for (const [name, check] of Object.entries(agentTracingContract)) it(name, () => check(new NoAgentTracing()));
});
