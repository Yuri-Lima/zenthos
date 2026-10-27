import { InjectionToken } from '@angular/core';
import { createApiClient, type ApiClient } from '@zenthos/api-client';
import { environment } from '../../environments/environment';

/** The typed client generated from the API's OpenAPI document (ADR 003); the only way pages reach the API. */
export const API = new InjectionToken<ApiClient>('zenthos.api', { providedIn: 'root', factory: () => createApiClient(environment.apiUrl) });

/** Where the browser goes to sign in; the API sends it back to the dashboard afterwards (ADR 007). */
export const signInUrl = (returnTo: string) => `${environment.apiUrl}/auth/github?returnTo=${encodeURIComponent(returnTo)}`;

/** Where the browser goes to install the platform app for the workspace; GitHub and the API bring it back to /settings (ADR 019). */
export const installUrl = () => `${environment.apiUrl}/github/install`;

/** Where the operator's setup form posts; the API answers with the page that sends the manifest to GitHub (ADR 019). */
export const setupManifestAction = () => `${environment.apiUrl}/platform/github/manifest`;
