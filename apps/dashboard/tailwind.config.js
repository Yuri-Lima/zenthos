const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind');
const { join } = require('path');

/** Tailwind 3 for layout and spacing; Angular Material provides the components and the theme. */
module.exports = {
  content: [join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'), ...createGlobPatternsForDependencies(__dirname)],
  theme: { extend: {} },
  plugins: [],
  corePlugins: { preflight: false },
};
