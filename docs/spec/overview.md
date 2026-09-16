# Overview & Tech Stack

**Status**: Planning / Research phase - not ready for implementation

Personal TypeScript browser built on Electron with Chrome extension support, React UI, and full UX control. **Arc Browser-inspired design** with command palette navigation instead of traditional address bar.

## Tech Stack

- **Runtime**: Electron (Chromium + Node.js)
- **Package manager**: Bun
- **Language**: TypeScript (strict mode)
- **UI**: React 19 + React Compiler + Vite
- **Components**: shadcn/ui
- **Styling**: Tailwind CSS 4
- **Storage**: RxDB (free filesystem storage) for structured data, JSON for settings
- **Ad blocking**: `@cliqz/adblocker-electron` (Ghostery) — native, no extension needed
- **Extensions**: Native Electron runtime with an in-house compatibility adapter; experimental, with Bitwarden as the validated target
- **IPC**: Command bus + event bus with typed registries (bridges IPC transparently)
