/**
 * Base URL for pdfjs-dist 6's JBIG2/OpenJPEG/QCMS decoder assets
 * (jbig2.wasm, jbig2_nowasm_fallback.js, etc.), served by the
 * `pdfjs-wasm-assets` Vite plugin (vite.config.js) directly from the
 * installed pdfjs-dist package — see that plugin's own comment for why
 * these can't go through Vite's normal `?url` asset pipeline.
 *
 * Passed as getDocument()'s `wasmUrl` option by both pdfjs-loader.ts and
 * output-validator.ts (two independent loaders, kept separate for their
 * own reasons — see pdfjs-loader.ts's module comment — but which must
 * never drift on *this* value, hence the shared constant). Without it,
 * `wasmUrl` defaults to null and PDF.js concatenates it directly onto an
 * asset filename, producing exactly the reported
 * "Failed to resolve module specifier 'nulljbig2_nowasm_fallback.js'".
 *
 * import.meta.env.BASE_URL already reflects Vite's configured `base` (and
 * always ends with "/"), so this resolves correctly under a subpath
 * deployment, not just when served from "/".
 */
export const PDFJS_WASM_URL = `${import.meta.env.BASE_URL}pdfjs-wasm/`;
