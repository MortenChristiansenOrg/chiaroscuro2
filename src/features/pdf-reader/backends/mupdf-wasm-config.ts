// Configure the asset before MuPDF initializes. Vite bundles the WASM alongside
// the renderer so installed apps load it locally, without a server or CDN.
const wasmUrl = new URL("../../../../node_modules/mupdf/dist/mupdf-wasm.wasm", import.meta.url)
  .href;
globalThis.$libmupdf_wasm_Module = { locateFile: () => wasmUrl };
