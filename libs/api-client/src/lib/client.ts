import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './schema.js';

export type ApiClient = Client<paths>;

/**
 * The typed client over the API, generated from apps/api/openapi.json (ADR 003): every path, parameter and
 * response shape comes from the controllers, never hand-written. `credentials: 'include'` carries the
 * session cookie once sign-in exists.
 */
export const createApiClient = (baseUrl: string, fetchImpl: typeof fetch = fetch): ApiClient => createClient<paths>({ baseUrl, fetch: fetchImpl, credentials: 'include' });
