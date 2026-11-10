# Agent notes

## 2026-11-10
- Setup: branch checked out, `npm install` ok, `git push --dry-run` ok.
- Task 2 (website): added `library-worker/index.html` (landing page, light/dark, mobile) and a `/` route in `library-worker/worker.js` (KV key `site/index.html`). `scripts/deploy-parking-library.ts` now publishes it like privacy.html. Deployed using the live manifest as the library dir (no tiles rebuilt; manifest verified identical). Live at https://oversized-parking-library.oversized-parking-17bb38.workers.dev/ (KV edge cache took ~30s to show it). Contact shown is the address already in the privacy policy (jdcraig7@gmail.com) - owner may want a dedicated support address.
