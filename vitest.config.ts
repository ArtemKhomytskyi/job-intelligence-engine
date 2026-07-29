import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        '**/*.d.ts',
        'src/application/persistence/use-cases.ts',
        'src/application/collection/existing-persistence.ts',
        'src/infrastructure/persistence/**',
        'src/interfaces/cli/database-command.ts',
        'src/interfaces/cli/collect-command.ts',
        'src/interfaces/cli/main.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: 'node',
    exclude: ['tests/database/**/*.test.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
