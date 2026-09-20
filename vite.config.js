import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { cpSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// pdfjs-dist 6's JBIG2/OpenJPEG/QCMS decoders load from a `wasm/` directory
// shipped inside the package itself (jbig2.wasm, its pure-JS
// _nowasm_fallback.js sibling, etc.) — getDocument()'s own `wasmUrl` option
// is a *base URL* that PDF.js concatenates its own literal filenames onto
// (`wasmUrl + "jbig2_nowasm_fallback.js"`), so these files cannot go
// through Vite's normal content-hashed `?url` asset pipeline (that would
// rename them, breaking the concatenation) — they need a stable,
// unhashed path instead. This plugin serves them directly from
// node_modules/pdfjs-dist/wasm at dev time and copies that same directory
// into the build output verbatim, so the served bytes are always exactly
// whatever pdfjs-dist version is actually installed — never a CDN, never
// a hand-copied/committed duplicate that can drift out of sync with it.
const PDFJS_WASM_SOURCE_DIR = fileURLToPath(new URL('./node_modules/pdfjs-dist/wasm/', import.meta.url))
const PDFJS_WASM_DIR_NAME = 'pdfjs-wasm'

function pdfjsWasmAssetsPlugin() {
  let outDir = 'dist'

  return {
    name: 'pdfjs-wasm-assets',
    configResolved(config) {
      outDir = config.build.outDir
    },
    configureServer(server) {
      const base = server.config.base || '/'
      const mountPath = `${base}${PDFJS_WASM_DIR_NAME}`.replace(/\/{2,}/g, '/')
      server.middlewares.use(mountPath, (req, res, next) => {
        const requestedName = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        // No subdirectories exist under wasm/ — reject anything that
        // isn't a bare filename rather than resolving it against the
        // source directory.
        if (!requestedName || requestedName.includes('/') || requestedName.includes('..')) {
          next()
          return
        }
        const filePath = path.join(PDFJS_WASM_SOURCE_DIR, requestedName)
        let stats
        try {
          stats = statSync(filePath)
        } catch {
          next()
          return
        }
        if (!stats.isFile()) {
          next()
          return
        }
        if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm')
        else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript')
        res.end(readFileSync(filePath))
      })
    },
    closeBundle() {
      cpSync(PDFJS_WASM_SOURCE_DIR, path.resolve(outDir, PDFJS_WASM_DIR_NAME), { recursive: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    pdfjsWasmAssetsPlugin(),
  ],
})
