import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outArg = process.argv.find((a) => a.startsWith('--out='));
const outputPath = resolve(
  process.cwd(),
  outArg ? outArg.slice('--out='.length) : 'openapi.json',
);

console.log(
  '[export-openapi] building TypeScript so the @nestjs/swagger plugin runs…',
);
const build = spawnSync('npx', ['nest', 'build'], { stdio: 'inherit' });
if (build.status !== 0) {
  console.error('[export-openapi] nest build failed');
  process.exit(build.status ?? 1);
}

console.log(
  '[export-openapi] introspecting OpenAPI document from compiled output…',
);
// Dynamic import with a runtime path so TypeScript does not try to resolve
// the file at compile time (it does not exist yet during the first run).
const bootstrapPath = '../dist/src/bootstrap-export-openapi.js';
const bootstrap = await import(/* @vite-ignore */ bootstrapPath);
await bootstrap.exportOpenApiToFile(outputPath);
