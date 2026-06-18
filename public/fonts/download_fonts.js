const fs = require('fs');
const path = require('path');
const https = require('https');

const fontsDir = __dirname;

const fonts = [
  {
    name: 'Inter-Regular.woff2',
    url: 'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Regular.woff2'
  },
  {
    name: 'JetBrainsMono-Regular.woff2',
    url: 'https://github.com/JetBrains/JetBrainsMono/raw/master/web/woff2/JetBrainsMono-Regular.woff2'
  },
  {
    name: 'Geist-Regular.woff2',
    url: 'https://raw.githubusercontent.com/vercel/geist-font/main/packages/core/fonts/geist-sans/Geist-Regular.woff2'
  },
  {
    name: 'GeistMono-Regular.woff2',
    url: 'https://raw.githubusercontent.com/vercel/geist-font/main/packages/core/fonts/geist-mono/GeistMono-Regular.woff2'
  }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: Status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${path.basename(dest)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading bundled fonts...');
  for (const font of fonts) {
    const dest = path.join(fontsDir, font.name);
    try {
      await download(font.url, dest);
    } catch (e) {
      console.error(`Error downloading ${font.name}:`, e.message);
    }
  }
  console.log('Done downloading fonts.');
}

main();
