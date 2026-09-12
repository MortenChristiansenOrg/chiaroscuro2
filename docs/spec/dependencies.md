# Dependencies & Build

## Installation policy

Use Node.js 24.20.0 LTS (`.node-version`) for build/test tools; jsdom 30 requires at least
Node 24.15.0 on the 24.x line. CI explicitly installs this runtime.

Use Bun 1.3.11 or newer; `packageManager` and CI pin the verified version to 1.3.11.
Run `bun install --frozen-lockfile` for a checkout and `bun update --latest` for upgrades.

- `bunfig.toml` requires npm releases to be at least 86,400 seconds (one day) old.
  This applies to newly resolved direct and transitive dependencies, with no exceptions.
  Existing lockfile entries are reused; the age gate does not revalidate locked versions.
- `package.json` explicitly allows dependency lifecycle scripts only for
  `electron` (runtime download), `esbuild` (binary setup), and `@biomejs/biome`
  (binary setup). This replaces Bun's default trusted list. Other dependency scripts
  stay blocked; use `bun pm untrusted` to inspect them and review any allowlist change.
- Electron 44 downloads its executable on first use instead of during postinstall.
  `bun run setup:electron` explicitly prepares the locked executable before parallel
  E2E workers and before native Windows launch; this prevents simultaneous downloads.
- Windows development also requires Bun on Windows and installs the same lockfile
  and policy on every launch, so an existing Electron installation is updated.
  Do not use npm to install this project's dependencies; it does not enforce this policy.

See [Bun's release-age documentation](https://bun.com/docs/pm/cli/install#minimum-release-age)
and [lifecycle-script documentation](https://bun.com/docs/pm/lifecycle).

## Key Packages

`package.json` and `bun.lock` are the authoritative dependency list and resolved versions.

- Electron 44.3.0: includes the native window display-mode persistence fix;
  adopted after it cleared the 24-hour release-age gate on September 9, 2026.
- React 19, RxDB 17, Zustand 5, Zod 4, Tailwind CSS 4.
- PDF rendering: PDF.js 6.
- Build and validation: electron-builder 26, electron-vite 5, TypeScript 7,
  Biome 2, Vitest 5, and Playwright 1.63.
- Vite stays on the latest compatible 7.x release, with `@vitejs/plugin-react` 5.x.
  electron-vite 5 only supports Vite 5–7; plugin-react 6 requires Vite 8.
  React Compiler remains enabled through the Babel plugin.
- The Biome 2 migration preserves the previous CSS checking scope and defers its
  newly recommended `noStaticElementInteractions` rule for existing drag/hover UI.

**Tailwind**: Use `@tailwindcss/vite` with `moduleResolution: "bundler"`.
**Zustand**: Use inline selectors (`useStore(s => s.field)`) and `useShallow` for multiple fields.

## Build & Distribution

- `electron-builder` for packaging
- Target: Windows only (NSIS installer)

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
3. Builds for Windows via `electron-builder`
4. Uploads artifacts to GitHub Releases
5. `electron-updater` in browser checks releases periodically
6. Downloads + installs update, prompts user to restart

**Required**:

- GitHub Actions workflow (`.github/workflows/release.yml`)
- Shared packaging settings in `electron-builder.yml`, channel metadata in
  `src/shared/app-channel.ts` and `scripts/release-config.ts`
- Code signing (skipped for personal use)

Stable tags publish on push. Early Access tags such as `v1.2.3-beta.1` publish only
through a manual Release workflow run and produce a separate installation/update
channel. See the [installer specification](../features/InstallerFeature.specs.md)
for publishing commands and isolation behavior. Use `bun run package:win TAG` for
local Windows packaging without publishing.
