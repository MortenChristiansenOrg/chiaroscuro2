const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

// Check the actual archive on every release, including Windows CI. A successful
// renderer build alone cannot catch accidentally reintroduced production deps.
exports.default = async function checkDistribution(context) {
  const archive = path.join(context.appOutDir, "resources", "app.asar");
  const files = asar.listPackage(archive).map((file) => file.replaceAll("\\", "/"));
  for (const dependency of ["rxdb", "zod", "yauzl", "electron-updater"]) {
    assert(files.includes(`/node_modules/${dependency}/package.json`), `Missing ${dependency}`);
  }
  for (const dependency of [
    "react",
    "react-dom",
    "react-error-boundary",
    "zustand",
    "pdfjs-dist",
    "mupdf",
    "@fortawesome/fontawesome-free",
    "@napi-rs/canvas",
  ]) {
    assert(
      !files.some((file) => file.startsWith(`/node_modules/${dependency}/`)),
      `Redundant runtime dependency: ${dependency}`,
    );
  }
  assert(
    !files.some((file) => file.includes("/node_modules/@napi-rs/canvas-")),
    "Native PDF canvas binaries must not ship with the browser renderer",
  );
  assert(
    files.some((file) => /\/out\/renderer\/assets\/mupdf-wasm.*\.wasm$/.test(file)),
    "Missing bundled MuPDF WASM engine",
  );
  assert(
    !files.some((file) => /\/out\/renderer\/assets\/(pdfjs-backend|pdf\.worker)/.test(file)),
    "Obsolete PDF.js assets must not ship with the MuPDF reader",
  );
  assert(
    files.some((file) => file.startsWith("/resources/bundled-licenses/mupdf/")),
    "Missing MuPDF license notice",
  );
  assert(
    files.some((file) => file.endsWith(".woff2")),
    "Missing bundled icon fonts",
  );
  assert(
    files.some((file) => file.startsWith("/resources/bundled-licenses/react/")),
    "Missing bundled dependency notices",
  );
  if (context.electronPlatformName === "win32") {
    const locales = fs.readdirSync(path.join(context.appOutDir, "locales"));
    assert.deepEqual(locales.filter((file) => file.endsWith(".pak")).sort(), [
      "da.pak",
      "en-GB.pak",
      "en-US.pak",
    ]);
  }
  console.log(
    `Verified distribution: RxDB retained; renderer dependencies bundled; archive ${(fs.statSync(archive).size / 1048576).toFixed(1)} MiB`,
  );
};
