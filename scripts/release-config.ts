import type { Configuration } from "electron-builder";
import { APP_CHANNELS, RELEASE_REPOSITORY, releaseTag } from "../src/shared/app-channel";

export function releaseConfig(tag: string): Configuration {
  const { channel, version } = releaseTag(tag);
  const identity = APP_CHANNELS[channel];
  const [owner, repo] = RELEASE_REPOSITORY.split("/");
  return {
    extends: "electron-builder.yml",
    appId: identity.appId,
    productName: identity.productName,
    executableName: identity.productName,
    extraMetadata: { name: identity.packageName, version, releaseChannel: channel },
    directories: { output: `dist/${channel}` },
    win: { icon: `resources/${identity.icon}.ico` },
    nsis: {
      // Early Access always uses its own default directory.
      allowToChangeInstallationDirectory: channel === "stable",
      installerIcon: `resources/${identity.icon}.ico`,
      uninstallerIcon: `resources/${identity.icon}.ico`,
      installerHeaderIcon: `resources/${identity.icon}.ico`,
      artifactName: `${identity.productName.replaceAll(" ", "-")}-Setup-\${version}.\${ext}`,
    },
    detectUpdateChannel: false,
    generateUpdatesFilesForAllChannels: false,
    publish: { provider: "github", owner, repo, channel: identity.updateChannel },
  };
}
