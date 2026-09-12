// Optional asset-maintenance utility; FFmpeg is not required to build the app.
// Re-encode a source PNG and create a Windows ICO with explicit small sizes.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [sourceArgument, destination] = process.argv.slice(2);
if (!sourceArgument || !destination)
  throw new Error("Usage: bun scripts/convert-app-icon.ts source.png resources/icon-variant");
const source = sourceArgument;
function png(size: number) {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      source,
      "-vf",
      `scale=${size}:${size}:flags=lanczos`,
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "-frames:v",
      "1",
      "-",
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}
writeFileSync(`${destination}.png`, png(512));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = sizes.map(png);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const frame = frames[i];
  if (!frame) throw new Error("Missing icon frame");
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
writeFileSync(`${destination}.ico`, Buffer.concat([header, ...frames]));
