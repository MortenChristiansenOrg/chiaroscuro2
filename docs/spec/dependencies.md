# Dependencies & Build

## Key Packages

```json
{
  "electron": "^35.0.0",
  "electron-updater": "^6.x",
  "electron-chrome-extensions": "^4.9",
  "electron-chrome-web-store": "^0.13",
  "@cliqz/adblocker-electron": "^1.34",
  "rxdb": "^16.x",
  "rxdb-utils": "^2.x",
  "react": "^19.x",
  "babel-plugin-react-compiler": "^19.x",
  "tailwindcss": "^4.x",
  "zustand": "^5.x",
  "zod": "^3.x"
}
```

**Dev dependencies**: `electron-builder` ^26.x, `electron-vite`
**Tailwind**: Use `@tailwindcss/vite` plugin (set `"moduleResolution": "bundler"` in tsconfig). Fallback: `@tailwindcss/postcss`.
**shadcn/ui**: `bunx shadcn@latest init` (supports TW4 natively; may need `vite.config.js` symlink for electron-vite detection)
**Zustand**: Use inline selectors (`useStore(s => s.field)`), avoid auto-generated selectors. Use `useShallow` for multi-field selections.
**RxDB**: Free Filesystem RxStorage for main process, Memory RxStorage for tests. No native modules required — pure JS.

## Build & Distribution

- `electron-builder` for packaging
- Target: Linux, macOS, Windows

### Default Browser (Windows)

- Register as default browser via `electron-builder` config
- Handle `http://`, `https://` protocol associations
- Register file associations (`.html`, `.htm`, etc.)
- Windows registry entries added during install

### External Application Protocol Support

- Handle protocol launches from other applications (e.g. `myapp://oauth/callback`)
- Register as a protocol handler for configured schemes so OAuth/login flows in external apps can redirect back to the browser
- Forward protocol URLs to the appropriate tab or open a new one

### Auto-Update Infrastructure

```text
Git tag (v1.0.0) → GitHub Actions → Build artifacts → GitHub Releases
                                                           ↓
                           Browser ← electron-updater ← Release assets
```

**Flow**:

1. Push git tag (`git tag v1.0.0 && git push --tags`)
2. GitHub Actions workflow triggers on tag push
3. Builds for Windows/macOS/Linux via `electron-builder`
4. Uploads artifacts to GitHub Releases
5. `electron-updater` in browser checks releases periodically
6. Downloads + installs update, prompts user to restart

**Required**:

- GitHub Actions workflow (`.github/workflows/release.yml`)
- `electron-updater` config in `electron-builder.yml`
- Code signing (recommended for Windows/macOS, can skip for personal use)
