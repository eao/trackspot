# AGENTS.md

## Project Overview

This repository contains **Trackspot**, a local-first album tracking app.

It has three main parts:

1. **Express backend** in `server/`
2. **Vanilla JS single-page frontend** in `public/`
3. **Spicetify scripts** at the repo root for Spotify desktop integration

There is **no build step** for the main app. The backend is CommonJS, the browser code is ES modules loaded directly from `public/index.html`.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the app:

```bash
node server/index.js
```

Useful commands:

```bash
npm run lint
npm run test
npm run test:watch
npm run check
npm run styles:sync
npm run db:export-json
```

Run a single test file:

```bash
npx vitest run tests/filter-utils.test.js
```

Default local URL:

```text
http://localhost:1060
```

## Environment

Expected root `.env` values:

```text
PORT=1060
HOST=0.0.0.0
DATA_DIR=./data
```

Runtime data is stored under `DATA_DIR`, especially:

- `data/albums.db`
- `data/images/`
- `data/preferences.json`
- `data/opacity-presets/`
- `data/themes/`
- user-uploaded background/theme preview assets

The app is designed for local/trusted use. There is **no auth layer**.

## Repository Map

### Backend

- `server/index.js`: app entry point, static serving, CORS, route mounting, error handling
- `server/config.js`: `.env` loading and runtime path/host/port resolution
- `server/db.js`: SQLite setup via `better-sqlite3`, schema creation, schema evolution with `ensureColumn`, trigger setup, DB replacement helpers
- `server/album-helpers.js`: album parsing and normalization utilities
- `server/spotify-helpers.js`: Spotify album URL/URI parsing and album-art download helpers
- `server/import-service.js`: import a Spotify GraphQL album payload into the DB
- `server/import-jobs.js`: CSV import queue and worker leasing
- `server/preferences-store.js`: persisted global preferences in `preferences.json`
- `server/personalization-store.js`: opacity presets, user themes, theme preview asset handling
- `server/background-library.js`: background image naming, listing, thumbnails, safety helpers
- `server/color-scheme-presets.js`: validates `styles/` and generates the browser preset module

### Routes

- `server/routes/albums.js`: album CRUD, wipe, Spicetify import, manual image upload, art actions
- `server/routes/imports.js`: CSV import job lifecycle, claim/complete/fail flow
- `server/routes/backup.js`: backup download, DB export, CSV export, restore/merge
- `server/routes/backgrounds.js`: primary and secondary background upload/delete/thumbnail APIs
- `server/routes/opacity-presets.js`: opacity preset CRUD
- `server/routes/themes.js`: theme CRUD
- `server/routes/preferences.js`: global preference GET/PATCH

### Frontend

- `public/index.html`: single HTML shell, large inline bootstrap script for initial body classes/CSS vars, all DOM IDs used by JS
- `public/style.css`: main stylesheet
- `public/js/app.js`: top-level initialization and event binding
- `public/js/state.js`: central shared state, DOM refs, constants, and remaining localStorage keys
- `public/js/render.js`: album loading and collection rendering
- `public/js/sidebar.js`: filters, sorting, presets, sidebar UI state
- `public/js/modal.js`: add/edit/delete flow
- `public/js/settings.js`: settings, reset behavior, CSV import UI, personalization bootstrapping
- `public/js/navigation.js`: page and collection-view routing
- `public/js/dashboard.js`: wrapped-page orchestration and year selection
- `public/js/stats-compute.js` and `public/js/stats-view.js`: stats calculations and rendering
- `public/js/wrapped-view.js`: wrapped UI
- `public/js/preferences.js`: frontend preferences fetch/apply/patch helpers
- `public/js/color-scheme-presets.generated.js`: generated file, do not hand-edit

### Styling and Theme Data

- `styles/*.json`: source of truth for built-in color schemes
- `styles/manifest.json`: controls built-in theme ordering and enablement
- `styles/README.md`: short guidance for style files

### Spicetify Integration

- `trackspot-spicetify.js`: main Spotify desktop helper/importer

### Tests

- `tests/`: extensive Vitest coverage for frontend logic and selected backend modules/routes
- `vitest.config.js`: jsdom test environment
- `eslint.config.js`: flat ESLint config for frontend JS, backend/scripts, tests, and `trackspot-spicetify.js`

## Architecture Notes

- The backend uses synchronous SQLite (`better-sqlite3`) intentionally.
- Schema evolution is done inline in `server/db.js` with `ensureColumn(...)`, not a formal migration system.
- Album data is fetched from Spotify once, then the frontend mainly operates on the fetched collection client-side.
- Frontend state is centralized in `public/js/state.js`; many modules mutate shared state and then trigger targeted re-renders.
- Navigation supports at least three page modes: `collection`, `stats`, and `wrapped`.
- Background personalization has **two slots**: primary and secondary.
- User-created themes depend on:
  - a color scheme preset
  - an opacity preset
  - optional background selections
  - a required preview image

## Generated and Derived Files

Be careful with generated assets:

- `public/js/color-scheme-presets.generated.js` is generated from `styles/manifest.json` and `styles/*.json`
- `npm run styles:sync` regenerates that module
- `server/index.js` validates the generated module on startup and tells you to run `npm run styles:sync` if it is stale
- `npm test` triggers `pretest`, which runs `npm run styles:sync`

If you change built-in style JSON or `styles/manifest.json`, regenerate the browser module.

## Testing Expectations

Before finishing a meaningful code change, prefer running:

```bash
npm run check
```

Notes:

- Tests are mostly unit-style and fast
- Many backend route tests call route internals via `router.__private`
- Several tests create temporary `DATA_DIR` directories and reload modules
- Current test coverage is stronger for frontend logic and route helpers than for full end-to-end server behavior

## Repo-Specific Conventions

### Preferences and localStorage

- Durable app preferences are primarily server-backed through `server/preferences-store.js`, `server/routes/preferences.js`, and `public/js/preferences.js`.
- `data/preferences.json` currently owns global preference state such as complex statuses, wrapped/welcome-tour preferences, saved filter/sort preset, layout/display settings, pagination settings, modal field visibility, content width, and quick-action toolbar button order/visibility mode.
- Some older `localStorage` keys are intentionally migrated once by `migrateLocalStoragePreferencesToServer()` and then removed after a successful preference patch.
- Remaining `localStorage` usage should be limited to early startup/cache values, per-browser/session state, or intentionally local controls. Examples include sidebar collapsed state, quick-action toolbar up/down enabled state, debug/wipe controls, CSV import notification state, personalization/theme startup cache, and welcome-tour temporary snapshots.
- Keys meant to be cleared by "Reset all settings" use the `ts_` prefix. If a key should survive resets, do **not** give it the normal reset-managed prefix without understanding the consequences.
- Named constants for remaining storage keys live in `public/js/state.js`; avoid adding new durable settings there unless they truly need to stay browser-local.

### Themes and personalization

- Built-in color schemes live in `styles/`
- User themes and opacity presets live in `data/`
- Included-with-app themes/presets are intentionally protected from edit/delete in store logic
- Deleting a background image or opacity preset can cascade into deleting dependent user themes

### Frontend structure

- `public/index.html` is not a trivial shell; many IDs/classes are hard dependencies for JS modules
- `public/js/state.js` is large and central; UI changes often need coordinated updates across `state.js`, `index.html`, `style.css`, and one or more feature modules
- The app relies on CSS classes applied before module load for layout and perceived startup performance

### Data and backups

- Backups and restores preserve more than albums; import job tables and linked assets matter too
- Album art paths are stored relative to the data image directory and served from `/images/...`

## Agent Guidance

- Ignore `_local/spicetify-docs/` unless the task explicitly needs it.
- Be cautious when editing route or store code that deletes files; personalization/background/theme features have dependency rules.
- When editing theme-related code, verify whether the source of truth is:
  - built-in JSON in `styles/`
  - generated browser data
  - persisted user data under `data/`
- When changing DB schema behavior, inspect `server/db.js` carefully and run relevant tests such as backup/restore, imports, and migration-focused tests.
- When changing frontend navigation, startup flow, personalization, or collection rendering, expect cross-module coupling and check related tests.
- When changing the welcome tour, remember that it temporarily mutates frontend state, navigation, filters, themes, modal visibility, preferences, remaining localStorage-backed UI/cache state, and server album-mutation locks. Verify restore behavior from collection and non-collection launch pages such as `/collection/list`, `/stats`, and `/wrapped`.
- Keep welcome tour cleanup robust around async failures: lock heartbeats, completion calls, and sample insertion should not leave the app locked, marked complete incorrectly, or visually restored to the wrong page. Escape/focus handling should preserve tour-owned UI and not close underlying modals/settings panels while a step is anchored to them.
- Welcome tour sample warnings should reflect actual sample presence, not only historical "samples added" preferences.

## Suggested Change Workflow

1. Inspect the relevant feature area and its tests first.
2. Determine whether the change touches source-of-truth data, generated data, or persisted runtime data.
3. Make the code change.
4. Regenerate derived files if needed.
5. Run targeted tests first, then broader checks if the change is substantial.
6. For welcome-tour flow changes, run `npm run check` and manually sanity-check replay from Settings plus first-run auto-start from an empty DB when practical.

## Known Non-Core / Local Areas

- `_local/` is for local-only reference material and scratch files; it is intentionally ignored by Git.
