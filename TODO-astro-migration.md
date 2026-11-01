# Migrate dufs-cloud/web (cloud gallery) to Astro (no React)

## what
The gallery SPA in `web/` becomes one Astro 7 static page. A set of custom
elements does the browsing, filtering, the media viewer and the editors in
vanilla TS. dufs keeps serving it from the cloud root with `render-spa`.
Navigation stays hash-based.

## steps
1. Do `~/src/utils/web_ui/TODO-astro-port.md` first. Then bump `@kuhyx/web-ui`
   from `web_ui-v0.3.1` to the new tag. `size-range` and `duration-range` use
   `RangeSlider`, which becomes `RangeSlider.astro` with `<range-slider>`.
2. Keep the deploy layout:
   - Set `build.assets: 'assets'` in `astro.config.mjs`.
     `scripts/setup_cloud_gallery.sh` `deploy_spa` copies `dist/assets` and
     `dist/index.html`, so it keeps working.
   - Asset URLs: dufs serves the page at `/` (HashRouter). Use `base: '/'`,
     or keep relative URLs. The old `base: "./"` has no Astro equivalent.
     Check that `/assets/...` resolves under the dufs root.
   - Keep `vite.worker.format: 'es'` in `astro.config.mjs` for the jassub
     WASM worker.
3. Use one page, `src/pages/index.astro`. `lib/use-hash-path.ts` becomes a
   plain `hashchange` store in `lib/hash-path.ts`.
4. Rewrite the 16 React files:
   - `app.tsx` becomes `index.astro` plus `<cloud-app>`, which wires the store,
     listing and grid.
   - `gallery`, `grid` and `filter-bar` become `<cloud-gallery>`, with virtual
     grid, selection and zip download.
   - The pickers and ranges (`folder-picker`, `extension-picker`, `size-range`,
     `duration-range`, `resolution-range`) wrap `<range-slider>` and native
     controls.
   - `media-viewer`, `audio-menu` and `subtitle-menu` become `<media-viewer>`.
     DASH and jassub run through plain TS from `use-dash-player.ts` and
     `use-jassub.ts`.
   - `text-editor`, `confirm-dialog` and `prompt-dialog` use `<dialog>` with TS.
     `transfer-banner` becomes a small element.
   - The 7 hook files in `hooks/` become plain modules returning
     subscribe/getState objects (listing, meta, cloud-index, subtitles,
     subtitle-manifest, dash-player, jassub).
5. Dependencies, from `web/`, exact pins via pnpm:
   - Add `astro@7.4.4`, `@astrojs/check@0.9.12`, `eslint-plugin-astro@3.2.1`
     and `@testing-library/dom`.
   - Remove `react`, `react-dom`, `@vitejs/plugin-react` and
     `@testing-library/react`.
   - Drop direct `vite`. Bump the stale pins (`vite` 8.3.2, `vitest` 5.0.3,
     `jsdom` 30.1.1) to newest stable. `jassub` stays.
6. Tests. Use vitest 5.0.5 with `getViteConfig()`:
   - Keep the 100% thresholds on `src/**/*.ts`.
   - The existing `lib/*.test.ts` stay.
   - Hook tests become module tests, and component tests become element tests
     in jsdom.
7. AgentReady does not apply. The agent-ready rule lists dufs cloud as an auth-gated
   service.
8. `app/` (Flutter) is untouched.

## done
Run from `web/`:
`pnpm install --frozen-lockfile && pnpm exec astro check && pnpm coverage && pnpm build && test -f dist/index.html && test -d dist/assets`
Then:
`! grep -q '"react"' package.json && ! grep -qE '"(react-dom|@vitejs/plugin-react)"' package.json && ! find src -name '*.tsx' | grep -q .`
Both exit 0.

## verify
On the dufs host, run `scripts/setup_cloud_gallery.sh`. Then open
`https://kuhy-cloud.duckdns.org/` logged in, in a headless chromium:
- The grid lists the root.
- The size filter narrows the grid.
- A video plays with subtitles.
- A scratch text file edits and saves (create it, delete it after).
- There are no console errors.

## read first
- `~/src/utils/web_ui/TODO-astro-port.md` (do it first)
- `scripts/setup_cloud_gallery.sh` (`deploy_spa`, `enable_render_spa`)
- `web/vite.config.ts`, `web/src/app.tsx`, `web/src/lib/use-hash-path.ts`, `web/src/hooks/use-jassub.ts`

REMOVE ME AFTER FINISH
