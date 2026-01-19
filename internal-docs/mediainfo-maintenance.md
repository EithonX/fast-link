# MediaInfo.js Maintenance & Update Guide

**Last Updated:** January 2026
**Library Version:** `mediainfo.js` v0.3.7

## Overview
We use a **vendored and patched** version of `mediainfo.js` in this project. This is necessary because the default library implementation is incompatible with Cloudflare Workers' security model, which disallows runtime WebAssembly compilation ("Wasm code generation disallowed").

We have implemented a workaround that loads a **pre-compiled** WebAssembly module (built by Vite/Cloudflare) and forces the library to use it synchronously.

## Files Involved
1.  **`app/lib/mediainfo-bundle.js`**: The vendored (and patched) library code. This is a copy of `dist/esm-bundle/index.js` from the npm package.
2.  **`app/services/MediaInfoModule.wasm`**: The WASM binary. This is imported by our factory to be processed by the build system.
3.  **`app/services/mediainfo-factory.server.ts`**: The factory that initializes the library using the patched bundle and the imported WASM module.

## Why Patching is Required
Cloudflare Workers require `WebAssembly.instantiate(module, imports)` where `module` is an already-compiled `WebAssembly.Module` object.
However, `mediainfo.js` (asm.js/emscripten output) has two blocking issues:
1.  **Wrapper Filter**: The outer `mediaInfoFactory` function filters out unknown options, so if we pass `wasmModule`, it gets stripped before reaching the core logic.
2.  **Fetch Priority**: The internal `instantiateAsync` logic prioritizes `fetch`ing the `.wasm` file over using a provided module instance, leading to a "Wasm code generation disallowed" runtime error.

## How to Update `mediainfo.js`
When you need to update the library to a newer version, you cannot just run `pnpm update`. You must manually update the vendored files and re-apply the patches.

### Step 1: Get the New Files
1.  Install the new version locally or in a temp folder: `pnpm i mediainfo.js@latest`.
2.  Copy `node_modules/mediainfo.js/dist/MediaInfoModule.wasm` to `app/services/MediaInfoModule.wasm`.
3.  Copy `node_modules/mediainfo.js/dist/esm-bundle/index.js` to `app/lib/mediainfo-bundle.js`.

### Step 2: Apply Patch 1 (The Factory Wrapper)
Open `app/lib/mediainfo-bundle.js` and go to the very bottom, close to the `mediaInfoFactory` function.

**Locate this block:**
```javascript
  // Options passed to the Emscripten module loader
  const mediaInfoModuleFactoryOpts = {
    // Silence all print in module
    print: noopPrint,
    printErr: noopPrint,
    locateFile: locateFile ?? defaultLocateFile,
    onAbort: err => {
      // ...
    }
  };
```

**Change it to:**
```javascript
  // Options passed to the Emscripten module loader
  const mediaInfoModuleFactoryOpts = {
    // Silence all print in module
    print: noopPrint,
    printErr: noopPrint,
    locateFile: locateFile ?? defaultLocateFile,
    // Pass custom WASM module if provided (critical for Cloudflare/Vite)
    wasmModule: options.wasmModule,
    onAbort: err => {
      // ...
    }
  };
```

### Step 3: Apply Patch 2 (The Instantiation Logic)
In `app/lib/mediainfo-bundle.js`, search for the function `async function instantiateAsync`. It is usually in the middle of the "Module" closure.

**Locate:**
```javascript
  async function instantiateAsync(binary, binaryFile, imports) {
    {
      try {
        var response = fetch(binaryFile, { credentials: 'same-origin' });
        // ...
```

**Insert this check at the very top of the function:**
```javascript
  async function instantiateAsync(binary, binaryFile, imports) {
    // Use pre-compiled module if provided
    if (Module['wasmModule']) {
      try {
        var instance = await WebAssembly.instantiate(Module['wasmModule'], imports);
        return { instance: instance, module: Module['wasmModule'] };
      } catch (e) {
        // err/abort are internal logging variables in this scope
        if (typeof err !== 'undefined') err(`wasm instantiation failed: ${e}`);
        if (typeof abort !== 'undefined') abort(e);
        console.error(e);
        throw e;
      }
    }
    // ... rest of the function (original fetch logic)
    {
      try {
        // ...
```

### Step 4: Verify
Run `pnpm build` and verify that the application (specifically the `resource.analyze` route) works correctly in the Cloudflare environment. The build should succeed, and runtime analysis should return metadata without "Code generation disallowed" errors.
