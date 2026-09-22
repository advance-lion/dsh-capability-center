import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // Host half: ESM for the Node host process.
    // Runs the capability registry, adapters, services, and HTTP routes.
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: false,
  },
  {
    // Client half: CJS + inlined CSS, wrapped into __ModuleLoader__ format by
    // scripts/wrap-client.mjs (the browser module loader speaks CJS factories).
    // Renders the Capability Center UI in the DSH web GUI sidebar.
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: false,
    platform: 'browser',
    css: { inject: true },
  },
])
