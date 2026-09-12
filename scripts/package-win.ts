import { Arch, build, Platform } from "electron-builder";
import { releaseConfig } from "./release-config";

const tag = process.argv[2];
if (!tag) throw new Error("Usage: bun run package:win v1.2.3[-beta.1]");
await build({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
  config: releaseConfig(tag),
  publish: "never",
});
