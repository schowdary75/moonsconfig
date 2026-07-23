import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// NOTE ON MIGRATION DEBT
// The client screens and server/src/legacy were migrated 1:1 from the legacy
// app for behavior parity (see the `@ts-nocheck -- behavior-parity` headers).
// Rules those files violate wholesale are relaxed below, scoped as tightly as
// possible, so lint gates NEW code without forcing risky rewrites of old code.
// Re-tighten these as the incremental type-hardening effort progresses.

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'client/public/**',
      'server/prisma/migrations/**',
    ],
  },

  // Shared TypeScript baseline for both workspaces.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // `_`-prefixed names are the conventional way to mark intentionally
      // unused values (e.g. removed tuple members, ignored handler args).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Migration debt: ~1200 occurrences across the migrated screens/APIs.
      '@typescript-eslint/no-explicit-any': 'off',
      // `@ts-nocheck` is tolerated only with a justification comment.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-nocheck': 'allow-with-description', minimumDescriptionLength: 10 },
      ],
    },
  },

  // Client: browser + React.
  {
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Migration debt: legacy effects depend on their exact (incomplete) dep
      // lists; auto-adding deps changes when effects fire. Revisit per-screen.
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
      // Migration debt in behavior-parity screens.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
    },
  },

  // Server: Node runtime (plus repo scripts).
  {
    files: ['server/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },

  // Server legacy API surface: migrated verbatim; style rules waived.
  {
    files: ['server/src/legacy/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
    },
  },

  // Registered legacy operations run behind the tenant-context adapter. They
  // remain isolated from SaaS routing until their domain-by-domain typing is
  // complete; keep style debt from obscuring security failures in new code.
  {
    files: ['server/src/operations/**/*.ts', 'server/src/compatibility/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
    },
  },

  // Keep formatting concerns out of lint; Prettier owns them.
  prettier,
);
