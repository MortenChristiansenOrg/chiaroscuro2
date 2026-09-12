import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { configureAppIdentity } from "./app-identity";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("preserves stable state and configures separate profiles before lock acquisition", () => {
  const root = mkdtempSync(path.join(tmpdir(), "chiaroscuro-channel-test-"));
  roots.push(root);
  const app = {
    getPath: (name: string) => (name === "userData" ? path.join(root, "existing-stable") : root),
    setPath: vi.fn(),
    setName: vi.fn(),
    setAppUserModelId: vi.fn(),
  };
  expect(configureAppIdentity(app, "stable")).toBe(path.join(root, "existing-stable"));
  expect(configureAppIdentity(app, "early-access")).toBe(
    path.join(root, "chiaroscuro-early-access"),
  );
  expect(configureAppIdentity(app, "dev")).toBe(path.join(root, "chiaroscuro-dev"));
  expect(app.setPath).toHaveBeenCalledWith("sessionData", path.join(root, "chiaroscuro-dev"));
  expect(app.setAppUserModelId).toHaveBeenCalledWith("com.chiaroscuro.browser.early-access");
  const testProfile = path.join(root, "test-chromium");
  expect(configureAppIdentity(app, "dev", testProfile)).toBe(testProfile);
});
