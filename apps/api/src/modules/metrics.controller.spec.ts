import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InMemoryTraceUsage } from '@zenthos/adapter-in-memory';
import { createRun, NO_TOKENS, withUsage } from '@zenthos/domain';
import { createAppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { inMemoryPorts } from '../ports.js';

const ticket = { key: 'o/r#300', title: 't', body: '', url: 'https://example.test', labels: [] };
const usage = (estimatedCostUsd: number) => ({ tokens: { ...NO_TOKENS, inputTokens: 10 }, estimatedCostUsd });

describe('GET /metrics/traces', () => {
  const ports = { ...inMemoryPorts(), traces: new InMemoryTraceUsage({ 'o/r#300': { spec_writer: { estimatedCostUsd: 0.5596, totalTokens: 79220 }, reviewer: { estimatedCostUsd: 0.7155, totalTokens: 119938 } } }) };
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    let run = createRun(ticket);
    run = withUsage(withUsage(withUsage(run, usage(0.56), 'spec_writer'), usage(5), 'coding_agent'), usage(0.9), 'reviewer');
    await ports.runStore.save(run);
    app = await NestFactory.create(createAppModule(ports, loadConfig({})), { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
    await ports.close();
  });

  it('compares the stored cost per traced agent with the trace backend, and links the session', async () => {
    const res = await fetch(`${base}/metrics/traces?ticket=${encodeURIComponent('o/r#300')}`);
    const body = (await res.json()) as { comparison: { agent: string; verdict: string }[] };
    expect(body).toMatchObject({ ticketKey: 'o/r#300', available: true, sessionUrl: 'memory://traces/o%2Fr%23300', tolerance: { relative: 0.05, absoluteUsd: 0.01 } });
    expect(body.comparison.map((c) => [c.agent, c.verdict])).toEqual([['spec_writer', 'match'], ['reviewer', 'mismatch']]);
  });

  it('answers 404 for a run it does not know', async () => {
    expect((await fetch(`${base}/metrics/traces?ticket=${encodeURIComponent('o/r#1')}`)).status).toBe(404);
  });
});
