import { CommandPalettePage } from "../pages/command-palette.page";
import { SidebarPage } from "../pages/sidebar.page";
import { WindowChromePage } from "../pages/window-chrome.page";
import { test as electronTest } from "./electron-app";

type AppFixtures = {
  sidebarPage: SidebarPage;
  commandPalettePage: CommandPalettePage;
  windowChromePage: WindowChromePage;
};

export const test = electronTest.extend<AppFixtures>({
  sidebarPage: async ({ shellPage }, use) => {
    await use(new SidebarPage(shellPage));
  },
  commandPalettePage: async ({ shellPage }, use) => {
    await use(new CommandPalettePage(shellPage));
  },
  windowChromePage: async ({ shellPage }, use) => {
    await use(new WindowChromePage(shellPage));
  },
});

export { expect } from "@playwright/test";
