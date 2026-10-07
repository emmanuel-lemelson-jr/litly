const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

function createIco(images) {
  const count = images.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const entries = [];
  const imageBuffers = [];

  for (const img of images) {
    const dibHeader = Buffer.alloc(40);
    dibHeader.writeUInt32LE(40, 0); // biSize
    dibHeader.writeInt32LE(img.width, 4); // biWidth
    dibHeader.writeInt32LE(img.height * 2, 8); // biHeight (doubled for XOR + AND masks)
    dibHeader.writeUInt16LE(1, 12); // biPlanes
    dibHeader.writeUInt16LE(32, 14); // biBitCount
    dibHeader.writeUInt32LE(0, 16); // biCompression
    dibHeader.writeUInt32LE(img.bgra.length, 20); // biSizeImage
    dibHeader.writeInt32LE(0, 24); // biXPelsPerMeter
    dibHeader.writeInt32LE(0, 28); // biYPelsPerMeter
    dibHeader.writeUInt32LE(0, 32); // biClrUsed
    dibHeader.writeUInt32LE(0, 36); // biClrImportant

    const imgData = Buffer.concat([dibHeader, img.bgra, img.andMask]);
    imageBuffers.push(imgData);

    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bitCount
    entry.writeUInt32LE(imgData.length, 8); // bytesInRes
    entry.writeUInt32LE(offset, 12); // imageOffset
    entries.push(entry);

    offset += imgData.length;
  }

  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2); // type 1 = icon
  icoHeader.writeUInt16LE(count, 4);

  return Buffer.concat([icoHeader, ...entries, ...imageBuffers]);
}

async function main() {
  console.log("1. Extracting and sanitizing mascot image...");
  const oldFavSvg = fs.readFileSync(path.join(PUBLIC_DIR, "favicon.svg"), "utf8");
  const match = oldFavSvg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (!match) throw new Error("Could not find embedded mascot PNG in favicon.svg");

  const rawEmbeddedBuf = Buffer.from(match[1], "base64");
  const { data: mascotData, info: mascotInfo } = await sharp(rawEmbeddedBuf)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Clean all transparent pixels: replace RGB(0, 255, 0) with RGB(0, 0, 0)
  const cleanMascotData = Buffer.from(mascotData);
  let sanitizedPixels = 0;
  for (let i = 0; i < cleanMascotData.length; i += 4) {
    if (cleanMascotData[i + 3] === 0) {
      if (cleanMascotData[i] !== 0 || cleanMascotData[i + 1] !== 0 || cleanMascotData[i + 2] !== 0) {
        sanitizedPixels++;
      }
      cleanMascotData[i] = 0;
      cleanMascotData[i + 1] = 0;
      cleanMascotData[i + 2] = 0;
    }
  }
  console.log(`Sanitized ${sanitizedPixels} transparent pixels (zeroed out Chroma key green)`);

  const cleanMascotPng = await sharp(cleanMascotData, {
    raw: { width: mascotInfo.width, height: mascotInfo.height, channels: 4 }
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const cleanMascotBase64 = cleanMascotPng.toString("base64");

  // 2. Generate master 512x512 rounded icon
  console.log("2. Generating master 512x512 icon...");
  const masterSize = 512;
  const masterRadius = 112; // ~21.875% iOS style squircle
  const mascotH = 440;
  const mascotW = Math.round(mascotH * (mascotInfo.width / mascotInfo.height)); // 272
  const mascotX = Math.round((masterSize - mascotW) / 2); // 120
  const mascotY = 36;

  const resizedMascot = await sharp(cleanMascotPng)
    .resize(mascotW, mascotH, { fit: "contain" })
    .toBuffer();

  const masterSvgBg = `<svg width="${masterSize}" height="${masterSize}" viewBox="0 0 ${masterSize} ${masterSize}">
    <rect width="${masterSize}" height="${masterSize}" rx="${masterRadius}" fill="#000000"/>
  </svg>`;

  const masterBg = await sharp(Buffer.from(masterSvgBg)).png().toBuffer();

  const masterIconBuf = await sharp(masterBg)
    .composite([{ input: resizedMascot, left: mascotX, top: mascotY }])
    .png()
    .toBuffer();

  // 3. Generate favicon.svg
  console.log("3. Writing public/favicon.svg...");
  const newFavSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <clipPath id="squircle">
      <rect width="128" height="128" rx="28"/>
    </clipPath>
  </defs>
  <g clip-path="url(#squircle)">
    <rect width="128" height="128" fill="#000000"/>
    <image href="data:image/png;base64,${cleanMascotBase64}" x="29" y="9" width="70" height="110"/>
  </g>
</svg>
`;
  fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.svg"), newFavSvg, "utf8");

  // 4. Generate public/favicon-32x32.png and public/favicon-16x16.png
  console.log("4. Writing public/favicon-32x32.png and public/favicon-16x16.png...");
  await sharp(masterIconBuf)
    .resize(32, 32)
    .png()
    .toFile(path.join(PUBLIC_DIR, "favicon-32x32.png"));

  await sharp(masterIconBuf)
    .resize(16, 16)
    .png()
    .toFile(path.join(PUBLIC_DIR, "favicon-16x16.png"));

  // 5. Generate public/apple-touch-icon.png (180x180, solid black background)
  console.log("5. Writing public/apple-touch-icon.png...");
  const appleH = 156;
  const appleW = Math.round(appleH * (mascotInfo.width / mascotInfo.height));
  const appleX = Math.round((180 - appleW) / 2);
  const appleY = 12;

  const appleMascot = await sharp(cleanMascotPng)
    .resize(appleW, appleH, { fit: "contain" })
    .toBuffer();

  await sharp({
    create: { width: 180, height: 180, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
  })
    .composite([{ input: appleMascot, left: appleX, top: appleY }])
    .png()
    .toFile(path.join(PUBLIC_DIR, "apple-touch-icon.png"));

  // 6. Generate public/favicon.ico (16, 32, 48 with 32-bit RGBA alpha)
  console.log("6. Writing public/favicon.ico...");
  const icoSizes = [16, 32, 48];
  const icoImages = [];

  for (const s of icoSizes) {
    const { data } = await sharp(masterIconBuf)
      .resize(s, s)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const bgra = Buffer.alloc(s * s * 4);
    const andRowBytes = Math.floor((s + 31) / 32) * 4;
    const andMask = Buffer.alloc(andRowBytes * s);

    for (let y = 0; y < s; y++) {
      const srcY = y;
      const dstY = s - 1 - y; // bottom-up DIB
      for (let x = 0; x < s; x++) {
        const srcIdx = (srcY * s + x) * 4;
        const dstIdx = (dstY * s + x) * 4;
        const r = data[srcIdx];
        const g = data[srcIdx + 1];
        const b = data[srcIdx + 2];
        const a = data[srcIdx + 3];

        bgra[dstIdx] = b;
        bgra[dstIdx + 1] = g;
        bgra[dstIdx + 2] = r;
        bgra[dstIdx + 3] = a;

        if (a === 0) {
          const byteIdx = dstY * andRowBytes + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          andMask[byteIdx] |= (1 << bitIdx);
        }
      }
    }
    icoImages.push({ width: s, height: s, bgra, andMask });
  }

  const icoBuf = createIco(icoImages);
  fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.ico"), icoBuf);

  // 7. Update public/logo.svg with clean mascot
  console.log("7. Sanitizing public/logo.svg...");
  const oldLogoSvg = fs.readFileSync(path.join(PUBLIC_DIR, "logo.svg"), "utf8");
  const newLogoSvg = oldLogoSvg.replace(
    /data:image\/png;base64,[A-Za-z0-9+/=]+/,
    `data:image/png;base64,${cleanMascotBase64}`
  );
  fs.writeFileSync(path.join(PUBLIC_DIR, "logo.svg"), newLogoSvg, "utf8");

  console.log("All favicon assets built successfully!");
}

main().catch(err => {
  console.error("Error building favicons:", err);
  process.exit(1);
});
