import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'server.mjs',
  // Bundled CommonJS dependencies call require(), which ESM doesn't define.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
