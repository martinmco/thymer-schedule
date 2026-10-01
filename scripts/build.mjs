import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const own = readFileSync(join(root, 'LICENSE'), 'utf8').trim();
const thirdParty = readFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8').trim();
const banner = `/*!\n${`${own}\n\n${thirdParty}`.split('\n').map((line) => line ? ` * ${line}` : ' *').join('\n')}\n */`;
mkdirSync(join(root, 'dist'), { recursive: true });

for (const [filename, minify] of [['plugin.js', false], ['plugin.min.js', true]]) {
  await build({
    entryPoints: [join(root, 'plugin.js')],
    outfile: join(root, 'dist', filename),
    bundle: true,
    format: 'iife',
    globalName: 'plugins',
    keepNames: true,
    target: 'es2020',
    minify,
    banner: { js: banner },
    legalComments: 'none'
  });
}
