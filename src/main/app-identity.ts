import { mkdirSync } from "node:fs";
import path from "node:path";
import { APP_CHANNELS, type AppChannel } from "../shared/app-channel";

interface IdentityApp {
  getPath(name: "userData" | "appData"): string;
  setPath(name: "userData" | "sessionData", value: string): void;
  setName(value: string): void;
  setAppUserModelId(value: string): void;
}

/** Call before acquiring the single-instance lock or creating any sessions. */
export function configureAppIdentity(app: IdentityApp, channel: AppChannel, testProfile?: string) {
  const identity = APP_CHANNELS[channel];
  // Preserve Electron's existing stable profile path, including capitalization.
  const userData =
    testProfile ??
    (channel === "stable"
      ? app.getPath("userData")
      : path.join(app.getPath("appData"), identity.packageName));
  mkdirSync(userData, { recursive: true });
  app.setPath("userData", userData);
  app.setPath("sessionData", userData);
  app.setName(identity.productName);
  app.setAppUserModelId(identity.appId);
  return userData;
}
