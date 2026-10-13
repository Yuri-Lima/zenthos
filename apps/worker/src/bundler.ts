import type { WorkerOptions } from '@temporalio/worker';

/**
 * The workflow bundle must resolve `@zenthos/*` to TypeScript sources the same way tsx and Jest do:
 * through the `@zenthos/source` export condition, with `.js` specifiers mapped onto `.ts` files.
 */
export const bundlerOptions: WorkerOptions['bundlerOptions'] = {
  webpackConfigHook: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      conditionNames: ['@zenthos/source', '...'],
      extensionAlias: { '.js': ['.ts', '.js'] },
    },
  }),
};
