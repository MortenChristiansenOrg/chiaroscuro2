import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const args = [
  require.resolve("@playwright/test/cli"),
  "test",
  "--config",
  "playwright.verification.config.ts",
  ...process.argv.slice(2),
];
// The full suite needs a window manager for focus, native controls and popup windows.
const linux = process.platform === "linux" && process.env.CHIAROSCURO_HEADED !== "1";
const child = linux
  ? spawn(
      "xvfb-run",
      [
        "-a",
        "-s",
        "-screen 0 1920x1080x24",
        "bash",
        "scripts/verification-desktop.sh",
        "node",
        ...args,
      ],
      { stdio: "inherit", env: { ...process.env, CHIAROSCURO_HEADED: "1" } },
    )
  : spawn("node", args, { stdio: "inherit" });
child.on("error", (error) => {
  console.error(
    `Cannot start verification: ${error.message}. Linux requires xvfb, xauth, openbox and xcompmgr; Windows requires Node and Electron. See docs/testing/agent-verification.md.`,
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
