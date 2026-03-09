import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'cli/index': 'src/cli/index.ts', 'mcp/index': 'src/mcp/index.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  outDir: 'dist',
  external: ['openai', '@google/generative-ai'],
});
