# Landing Screenshots

These WebP files are screenshots of the application's existing UI, not marketing mockups. They are captured with synthetic records from `tests/fixtures/landing-workspace.mjs`. No real account, credentials, personal records or live backend is involved.

To refresh them, serve the repository locally, make Playwright and Sharp available to Node, then run:

```sh
APP_URL=http://127.0.0.1:4174/ node tests/capture-landing-screens.mjs
```

The optional first argument selects one screenshot, such as `product-composition`. Set `PLAYWRIGHT_MODULE`, `SHARP_MODULE` or `BROWSER_PATH` if using a bundled runtime or a different Chromium executable.

The capture uses the real application markup, styles and controls. It replaces only the backend with isolated demo records and disables the decorative background scene. Crops frame useful sections, and Sharp encodes them as WebP without redrawing or resizing UI. Keep dimensions in `src/landing-screens.js` in sync with the capture output. `tests/landing-ui.mjs` checks each image's natural dimensions and its viewer on desktop and mobile.
