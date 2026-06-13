const encoder = new TextEncoder();

interface ZipEntry {
  name: string;
  content: Uint8Array;
  date: Date;
}

export function createZip(files: { name: string; content: string | Uint8Array }[]) {
  const entries: ZipEntry[] = files.map((file) => ({
    name: normalizeZipPath(file.name),
    content: typeof file.content === "string" ? encoder.encode(file.content) : file.content,
    date: new Date()
  }));
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.content);
    const compressedSize = entry.content.length;
    const uncompressedSize = entry.content.length;
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      dosTime(entry.date),
      dosDate(entry.date),
      u32(crc),
      u32(compressedSize),
      u32(uncompressedSize),
      u16(name.length),
      u16(0),
      name,
      entry.content
    ]);
    localParts.push(local);
    centralParts.push(concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      dosTime(entry.date),
      dosDate(entry.date),
      u32(crc),
      u32(compressedSize),
      u32(uncompressedSize),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name
    ]));
    offset += local.length;
  }

  const centralDirectory = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);
  return concat([...localParts, centralDirectory, end]);
}

function normalizeZipPath(path: string) {
  return path.replace(/^\/+/, "").replace(/\\/g, "/");
}

function concat(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16(value: number) {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

function u32(value: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
}

function dosTime(date: Date) {
  return u16((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2));
}

function dosDate(date: Date) {
  return u16(((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate());
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
