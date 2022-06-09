const fs = require('fs');
require('esbuild')
  .build({
    entryPoints: ['src/index.ts'],
    format: 'esm',
    sourcemap: true,
    bundle: true,
    outfile: 'dist/index.mjs',
  })
  .then(() => {
    // fix ethers for cloudflare worker
    let content = fs.readFileSync('dist/index.mjs').toString();
    content = content.replace('request.mode = "cors"', '//request.mode = "cors"');
    content = content.replace('request.cache = "no-cache"', '//request.cache = "no-cache"');
    content = content.replace('request.credentials = "same-origin"', '//request.credentials = "same-origin"');
    content = content.replace('request.referrer = "client"', '//request.referrer = "client"');
    fs.writeFileSync('dist/index.mjs', content);
  })
  .catch(() => process.exit(1));
