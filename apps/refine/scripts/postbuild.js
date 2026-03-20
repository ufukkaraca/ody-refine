#!/usr/bin/env node
/**
 * postbuild — ensures dist/cli.js has the shebang line and is executable.
 * TypeScript's tsc preserves shebangs, but this script is a safety net.
 */
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, '..', 'dist', 'cli.js');

const SHEBANG = '#!/usr/bin/env node\n';

const content = readFileSync(cliPath, 'utf-8');
if (!content.startsWith('#!')) {
  writeFileSync(cliPath, SHEBANG + content);
  console.log('postbuild: prepended shebang to dist/cli.js');
} else {
  console.log('postbuild: shebang already present in dist/cli.js');
}

chmodSync(cliPath, 0o755);
console.log('postbuild: set dist/cli.js executable (755)');
