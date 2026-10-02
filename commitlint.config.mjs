/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  // Do not skip fixup!/squash!/amend!/WIP commits: they must be squashed before merging.
  defaultIgnores: false,
  // Dependabot commits are machine-generated and already conventional, but their bodies
  // contain long URLs that would fail body-max-line-length.
  ignores: [(message) => /^Signed-off-by: dependabot\[bot\]/m.test(message)],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'build', 'ci', 'chore', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'contracts',
        'api',
        'db',
        'web',
        'docker',
        'deploy',
        'deps',
        'deps-dev',
        'ci',
        'wiki',
        'repo',
        'security',
        'auth',
        'vscode',
        'release',
      ],
    ],
    'header-max-length': [2, 'always', 72],
    'body-empty': [2, 'never'],
    'body-max-line-length': [2, 'always', 100],
  },
};
