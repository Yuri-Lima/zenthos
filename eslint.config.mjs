import nx from '@nx/eslint-plugin';

/** Packages the core (domain, ports, application) must never import. Adapters wrap them. */
const vendorPackages = [
  '@temporalio/*',
  '@langchain/*',
  'langchain',
  'langfuse',
  'langsmith',
  '@octokit/*',
  '@gitbeaker/*',
  '@nestjs/*',
  '@anthropic-ai/*',
  'openai',
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            { sourceTag: 'scope:domain', onlyDependOnLibsWithTags: [], bannedExternalImports: vendorPackages },
            { sourceTag: 'scope:ports', onlyDependOnLibsWithTags: ['scope:domain'], bannedExternalImports: vendorPackages },
            { sourceTag: 'scope:application', onlyDependOnLibsWithTags: ['scope:domain', 'scope:ports'], bannedExternalImports: vendorPackages },
            { sourceTag: 'scope:adapter', onlyDependOnLibsWithTags: ['scope:domain', 'scope:ports'] },
            { sourceTag: 'scope:agents', onlyDependOnLibsWithTags: ['scope:domain', 'scope:ports'] },
            { sourceTag: 'scope:evals', onlyDependOnLibsWithTags: ['scope:domain', 'scope:ports', 'scope:agents'] },
            { sourceTag: 'scope:client', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'scope:app', onlyDependOnLibsWithTags: ['*'] },
          ],
        },
      ],
    },
  },
];
