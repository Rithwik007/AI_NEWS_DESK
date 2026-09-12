const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, drawFn) {
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    let c = 0xFFFFFFFF;
    const update = (buf) => {
      for (let i = 0; i < buf.length; i++) {
        c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
      }
    };
    update(typeBuf);
    update(data);
    crc.writeUInt32BE((c ^ 0xFFFFFFFF) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function drawNewsIcon(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;

  const PAPER = [238, 237, 230, 255]; // #EEEDE6
  const INK = [30, 36, 48, 255];       // #1E2430
  const SLATE = [91, 100, 114, 255];   // #5B6472
  const SIGNAL = [47, 111, 98, 255];   // #2F6F62

  const pad = 0.08;
  if (nx < pad || nx > 1 - pad || ny < pad || ny > 1 - pad) {
    return [0, 0, 0, 0];
  }

  const cx = 0.5;
  const cy = 0.5;
  const rPlate = 0.40;
  const dx = nx - cx;
  const dy = ny - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > rPlate + 0.015) {
    return [0, 0, 0, 0];
  }
  if (dist >= rPlate - 0.01) {
    return INK;
  }

  if (ny >= 0.22 && ny <= 0.27 && nx >= 0.28 && nx <= 0.72) {
    return SIGNAL;
  }

  if (ny >= 0.32 && ny <= 0.39 && nx >= 0.28 && nx <= 0.72) {
    return INK;
  }

  if (ny >= 0.44 && ny <= 0.47 && nx >= 0.28 && nx <= 0.72) {
    return SLATE;
  }

  if (ny >= 0.51 && ny <= 0.54 && nx >= 0.28 && nx <= 0.65) {
    return SLATE;
  }

  if (ny >= 0.58 && ny <= 0.61 && nx >= 0.28 && nx <= 0.72) {
    return SLATE;
  }

  const bx = nx - 0.62;
  const by = ny - 0.68;
  if (Math.sqrt(bx * bx + by * by) <= 0.065) {
    return SIGNAL;
  }

  return PAPER;
}

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), createPng(192, 192, drawNewsIcon));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), createPng(512, 512, drawNewsIcon));

console.log('✓ Generated icon-192.png and icon-512.png in frontend/public/');
