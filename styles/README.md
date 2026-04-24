Theme source files live here.

- One theme per JSON file
- `manifest.json` controls dropdown order and visibility
- Keep a stable `id` inside the JSON for saved settings/localStorage
- Keep filenames stable; the manifest points at them
- Run `npm run styles:sync` if you want to regenerate the browser module manually

Example manifest entry:

```json
{ "id": "bunan-blue", "file": "bunan-blue.json", "enabled": true }
```

Anything in `styles-scrapped/` is ignored by the app.
