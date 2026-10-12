import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = new URL('../public/', import.meta.url);
const source = await readFile(new URL('favicon.svg', publicDir));
const render = (size) => sharp(source, { density: 288 }).resize(size, size);

await render(96).png().toFile(fileURLToPath(new URL('favicon-96x96.png', publicDir)));
// iOS supplies its own rounded mask, so fill the source's transparent corners.
await render(180).flatten({ background: '#586b55' }).png()
  .toFile(fileURLToPath(new URL('apple-touch-icon.png', publicDir)));

// ICO supports PNG frames; include the common browser and desktop sizes.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map((size) => render(size).png().toBuffer()));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL('favicon.ico', publicDir), Buffer.concat([directory, ...frames]));
console.log('Generated favicon.ico, favicon-96x96.png, and apple-touch-icon.png');
