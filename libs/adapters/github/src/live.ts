/**
 * The Octokit-backed wiring, on its own entry point (`@zenthos/adapter-github/live`): Octokit is ESM only and
 * Jest runs CommonJS, so the classes and the pure helpers stay importable from the package root without it.
 */
export * from './lib/github-apps.js';
export * from './lib/octokit.js';
