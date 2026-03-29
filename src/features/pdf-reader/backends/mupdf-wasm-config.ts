// Must be imported before "mupdf" — Vite rewrites import.meta.url inside
// mupdf-wasm.js so the default WASM resolution fetches an HTML page.
// Use a direct relative path since mupdf's package.json exports don't include the wasm file.
const wasmUrl = new URL("../../../../node_modules/mupdf/dist/mupdf-wasm.wasm", import.meta.url)
  .href;
globalThis.$libmupdf_wasm_Module = { locateFile: () => wasmUrl };
