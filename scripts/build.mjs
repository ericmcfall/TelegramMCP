import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const { metafile } = await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'server.mjs',
  metafile: true,
  // Bundled CommonJS dependencies call require(), which ESM doesn't define.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});

// server.mjs contains these packages, so their license notices must ship with it.
const packageDirs = new Set();
for (const input of Object.keys(metafile.inputs)) {
  const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (match) packageDirs.add(match[1]);
}

const notices = [...packageDirs].sort().map((dir) => {
  const { name, version, license } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const licenseFile = readdirSync(dir).find((file) => /^licen[cs]e/i.test(file));
  if (!licenseFile) throw new Error(`No license file found for ${name}`);
  const text = readFileSync(path.join(dir, licenseFile), 'utf8').trim();
  return `${name}@${version} (${license})\n${'-'.repeat(72)}\n${text}\n`;
});

writeFileSync(
  'THIRD_PARTY_LICENSES.txt',
  `server.mjs bundles the following packages.\n\n${notices.join('\n')}`,
);
