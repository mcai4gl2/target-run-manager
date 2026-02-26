const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],   // vscode is provided by the extension host — never bundle it
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: false,
}).catch(() => process.exit(1));
