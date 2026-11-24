/**
 * SessionClone - Premium Minimalist PNG Icon Generator
 * Generates crisp, modern, pixel-perfect icons for Chrome & Firefox
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([len, body, crcBuf]);
}

function encodeRGBAtoPNG(width, height, rgbaBuffer) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = createChunk('IHDR', ihdrData);

  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = rowOffset + 1 + x * 4;
      rawData[dstIdx] = rgbaBuffer[srcIdx];
      rawData[dstIdx + 1] = rgbaBuffer[srcIdx + 1];
      rawData[dstIdx + 2] = rgbaBuffer[srcIdx + 2];
      rawData[dstIdx + 3] = rgbaBuffer[srcIdx + 3];
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// Procedural renderer for sleek minimalist icon
function renderIcon(size) {
  const buffer = Buffer.alloc(size * size * 4);
  const scale = size / 128;
  const radius = 24 * scale;
  const margin = 4 * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded rectangle distance
      const rx = Math.max(margin + radius, Math.min(size - margin - radius, x));
      const ry = Math.max(margin + radius, Math.min(size - margin - radius, y));
      const dist = Math.hypot(x - rx, y - ry);

      if (dist > radius) {
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
        continue;
      }

      // Zinc dark background (#18181b -> #09090b)
      const ny = y / size;
      let r = Math.round(24 * (1 - ny) + 9 * ny);
      let g = Math.round(24 * (1 - ny) + 9 * ny);
      let b = Math.round(27 * (1 - ny) + 11 * ny);
      let a = 255;

      // Subtle 1px border (#27272a)
      if (dist > radius - (1.5 * scale)) {
        r = 39; g = 39; b = 42;
      }

      // Loop 1 (Left): center around (47, 64), rx=18, ry=25
      const l1_cx = 47 * scale;
      const l1_cy = 64 * scale;
      const l1_rx = 18 * scale;
      const l1_ry = 24 * scale;
      const l1_stroke = 3.2 * scale;

      // Distance to left capsule contour
      const l1_clampedY = Math.max(l1_cy - (l1_ry - l1_rx), Math.min(l1_cy + (l1_ry - l1_rx), y));
      const l1_dist = Math.hypot(x - l1_cx, y - l1_clampedY);

      if (Math.abs(l1_dist - l1_rx) < l1_stroke) {
        // Muted zinc-400 stroke
        r = 161; g = 161; b = 170;
      }

      // Loop 2 (Right): center around (81, 64), rx=18, ry=25
      const l2_cx = 81 * scale;
      const l2_cy = 64 * scale;
      const l2_rx = 18 * scale;
      const l2_ry = 24 * scale;
      const l2_stroke = 3.2 * scale;

      const l2_clampedY = Math.max(l2_cy - (l2_ry - l2_rx), Math.min(l2_cy + (l2_ry - l2_rx), y));
      const l2_dist = Math.hypot(x - l2_cx, y - l2_clampedY);

      if (Math.abs(l2_dist - l2_rx) < l2_stroke) {
        // Electric blue stroke (#3b82f6)
        r = 59; g = 130; b = 246;
      }

      // Center dots
      if (Math.hypot(x - l1_cx, y - l1_cy) < 3.5 * scale) {
        r = 113; g = 113; b = 122; // Zinc-500 dot
      }
      if (Math.hypot(x - l2_cx, y - l2_cy) < 3.5 * scale) {
        r = 96; g = 165; b = 250; // Blue-400 dot
      }

      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  return buffer;
}

const iconsDir = path.join(__dirname, '..', 'icons');
[16, 32, 48, 128].forEach(size => {
  const rgba = renderIcon(size);
  const png = encodeRGBAtoPNG(size, size, rgba);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated: ${outPath}`);
});
