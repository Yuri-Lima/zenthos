import { createApiClient } from './client.js';

describe('createApiClient', () => {
  it('calls the documented paths with typed parameters and parses the JSON', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(input instanceof Request ? input.url : String(input));
      return new Response(JSON.stringify([{ metric: 'gate_failures', value: 0 }]), { headers: { 'content-type': 'application/json' } });
    };
    const api = createApiClient('http://api.test', fetchImpl);
    const { data } = await api.GET('/metrics');
    expect(calls).toEqual(['http://api.test/metrics']);
    expect(data?.[0]?.metric).toBe('gate_failures');
    await api.GET('/runs', { params: { query: { ticket: 'owner/repo#1' } } });
    expect(calls[1]).toBe('http://api.test/runs?ticket=owner%2Frepo%231');
  });
});
