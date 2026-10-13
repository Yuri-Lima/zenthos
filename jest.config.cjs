// Root config so `npx jest` from the repo root runs every project. Nx runs projects one by one.
const { getJestProjectsAsync } = require('@nx/jest');

module.exports = async () => ({ projects: await getJestProjectsAsync() });
