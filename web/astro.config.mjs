import { defineConfig } from "astro/config";

// Static output served by dufs `render-spa` from the cloud root, so asset
// URLs are absolute from "/" and the document path is always "/" (the app
// routes on the URL hash). `assets: "assets"` keeps the dist layout
// (`dist/assets`, `dist/index.html`) that scripts/setup_cloud_gallery.sh
// deploy_spa copies.
export default defineConfig({
  output: "static",
  base: "/",
  build: { assets: "assets" },
  server: { port: 5273 },
  vite: {
    // jassub (libass in WASM) ships an ES-module worker that code-splits,
    // which Vite's default "iife" worker format cannot emit.
    worker: { format: "es" },
  },
});
