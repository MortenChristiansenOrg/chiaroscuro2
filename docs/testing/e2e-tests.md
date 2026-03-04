# E2E Tests

## Overview

E2E tests use Playwright's Electron API to launch the real app and drive it through primary user flows. They cover the full stack: UI → IPC → main process → platform → data store.

## Configuration

`playwright.config.ts`:
- Test directory: `./e2e`
- Timeout: 30 seconds per test
- Retries: 2 on CI, 0 locally (trace recorded on first retry)

## Directory Structure

```text
e2e/
  fixtures/
    electron-app.ts           # Electron launch fixture
    test.ts                   # Extended test with page objects
  pages/
    sidebar.page.ts           # Sidebar page object
    command-palette.page.ts   # Command palette page object
    window-chrome.page.ts     # Window chrome page object
    ...                       # one per feature area
  helpers/
    ipc.ts                    # Main-process IPC helpers
  tests/
    sidebar/
      tab-management.spec.ts
      workspace-switching.spec.ts
      drag-reorder.spec.ts
    tabs/
      create-close.spec.ts
      bookmark-toggle.spec.ts
    command-palette/
      navigation.spec.ts
    ...                       # one dir per feature
```

## Page Object Model

Each page object encapsulates locators and high-level actions for a feature area. Since Chiaroscuro is a single-window app with sub-regions, page objects represent **feature regions** not separate pages.

### Rules

1. **Locators are properties, actions are methods.** Locators defined in constructor, never in test files.
2. **Page objects never make assertions.** Tests assert, page objects interact.
3. **Page objects return data for assertions** (e.g. `getTabTitles(): Promise<string[]>`).
4. **Compose, don't inherit.** Multiple page objects can wrap the same `Page` — use composition.
5. **Name methods from the user's perspective** (`switchWorkspace`, `closeTab`, not `clickElement`).

### Example

```ts
// e2e/pages/sidebar.page.ts
import type { Page, Locator } from "@playwright/test";

export class SidebarPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly tabList: Locator;
  readonly activeTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator("[data-testid='sidebar']");
    this.tabList = this.sidebar.locator("[data-testid='tab-list']");
    this.activeTab = this.tabList.locator("[data-state='active']");
  }

  async switchWorkspace(name: string) {
    await this.sidebar
      .locator(`[aria-label="Switch to ${name}"]`)
      .click();
  }

  async getTabCount(): Promise<number> {
    return this.tabList.locator("[data-tab-id]").count();
  }

  async clickTab(title: string) {
    await this.tabList.locator("[data-tab-id]", { hasText: title }).click();
  }

  async closeTab(title: string) {
    const tab = this.tabList.locator("[data-tab-id]", { hasText: title });
    await tab.hover();
    await tab.locator("[aria-label='Close tab']").click();
  }

  async dragTab(fromTitle: string, toTitle: string) {
    const from = this.tabList.locator("[data-tab-id]", { hasText: fromTitle });
    const to = this.tabList.locator("[data-tab-id]", { hasText: toTitle });
    await from.dragTo(to);
  }

  async getTabTitles(): Promise<string[]> {
    return this.tabList
      .locator("[data-tab-id] [data-testid='tab-title']")
      .allTextContents();
  }
}
```

### Command Palette Page Object

```ts
// e2e/pages/command-palette.page.ts
import type { Page, Locator } from "@playwright/test";

export class CommandPalettePage {
  readonly page: Page;
  readonly overlay: Locator;
  readonly input: Locator;
  readonly results: Locator;

  constructor(page: Page) {
    this.page = page;
    this.overlay = page.locator("[data-testid='command-palette']");
    this.input = this.overlay.locator("input");
    this.results = this.overlay.locator("[data-testid='suggestion-list']");
  }

  async open() {
    await this.page.keyboard.press("Control+k");
    await this.overlay.waitFor({ state: "visible" });
  }

  async close() {
    await this.page.keyboard.press("Escape");
    await this.overlay.waitFor({ state: "hidden" });
  }

  async search(query: string) {
    await this.input.fill(query);
  }

  async selectResult(index: number) {
    await this.results.locator(`[data-index="${index}"]`).click();
  }
}
```

## Electron Fixture

```ts
// e2e/fixtures/electron-app.ts
import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { test as base } from "@playwright/test";

type ElectronFixtures = {
  electronApp: ElectronApplication;
  shellPage: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: ["./out/main/index.js"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        ELECTRON_DISABLE_GPU: "1",
      },
    });
    await use(app);
    await app.close();
  },

  shellPage: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForSelector("[data-testid='shell-ready']");
    await use(page);
  },
});

export { expect } from "@playwright/test";
```

## Composing Fixtures with Page Objects

```ts
// e2e/fixtures/test.ts
import { test as electronTest } from "./electron-app";
import { SidebarPage } from "../pages/sidebar.page";
import { CommandPalettePage } from "../pages/command-palette.page";

type AppFixtures = {
  sidebarPage: SidebarPage;
  commandPalettePage: CommandPalettePage;
};

export const test = electronTest.extend<AppFixtures>({
  sidebarPage: async ({ shellPage }, use) => {
    await use(new SidebarPage(shellPage));
  },
  commandPalettePage: async ({ shellPage }, use) => {
    await use(new CommandPalettePage(shellPage));
  },
});

export { expect } from "@playwright/test";
```

## Writing E2E Tests

```ts
// e2e/tests/sidebar/tab-management.spec.ts
import { test, expect } from "../../fixtures/test";

test.describe("tab management", () => {
  test("opens new tab via command palette", async ({ sidebarPage, commandPalettePage }) => {
    const before = await sidebarPage.getTabCount();
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.page.keyboard.press("Enter");

    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBe(before + 1);
    }).toPass({ timeout: 5000 });
  });

  // Note: these tests assume tabs created in beforeEach or prior tests.
  // In real test files, use a beforeEach fixture to seed required tabs.

  test("closes tab via close button", async ({ sidebarPage }) => {
    await sidebarPage.closeTab("Example");
    await expect(async () => {
      const titles = await sidebarPage.getTabTitles();
      expect(titles).not.toContain("Example");
    }).toPass({ timeout: 3000 });
  });

  test("reorders tabs via drag", async ({ sidebarPage }) => {
    await sidebarPage.dragTab("Tab A", "Tab C");
    const order = await sidebarPage.getTabTitles();
    expect(order.indexOf("Tab A")).toBeGreaterThan(order.indexOf("Tab C"));
  });
});
```

## Electron-Specific Concerns

### IPC Evaluation

Execute code in the main process from tests:

```ts
// e2e/helpers/ipc.ts
import type { ElectronApplication } from "playwright";

export async function sendCommand(
  app: ElectronApplication,
  name: string,
  payload: unknown,
): Promise<unknown> {
  return app.evaluate(
    async (_electron, { name, payload }) => {
      const hooks = (globalThis as any).__testHooks;
      if (!hooks) throw new Error("Test hooks not available — is NODE_ENV=test?");
      return hooks.commandBus.send(name, payload);
    },
    { name, payload },
  );
}
```

Expose test hooks conditionally in main process:

```ts
// src/main/index.ts
if (process.env.NODE_ENV === "test") {
  (global as any).__testHooks = { commandBus, eventBus, store };
}
```

### WebContentsView

Playwright's `_electron` API exposes `BrowserWindow` instances as pages but does not automatically expose `WebContentsView` children. Options:

1. Use `app.evaluate()` to drive tab content from the main process
2. Use CDP directly for tab content testing
3. Test tab content behavior through commands/events

### Multiple Windows

```ts
test("opens settings in new window", async ({ electronApp, commandPalettePage }) => {
  const windowPromise = electronApp.waitForEvent("window");
  await commandPalettePage.open();
  await commandPalettePage.search("Settings");
  await commandPalettePage.page.keyboard.press("Enter");
  const settingsPage = await windowPromise;
  await expect(settingsPage.locator("h1")).toHaveText("Settings");
});
```

### Test Data Isolation

For E2E, use a temp data directory per test run:

```ts
electronApp: async ({}, use) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-test-"));
  const app = await electron.launch({
    args: ["./out/main/index.js"],
    env: { ...process.env, NODE_ENV: "test", DATA_DIR: tmpDir },
  });
  try {
    await use(app);
  } finally {
    await app.close().catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
},
```

## CI/CD

Electron tests must run serially (`workers: 1`) since they share a single app instance.

```ts
// playwright.config.ts
export default defineConfig({
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
});
```

On Linux, Electron runs with `--ozone-platform=headless` (set automatically in the
test fixture), so no display server or `xvfb-run` wrapper is needed.
