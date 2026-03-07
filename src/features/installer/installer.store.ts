import { create } from "zustand";
import {
  INSTALLER_PROTOCOL_LAUNCH_REQUESTED,
  INSTALLER_UPDATE_AVAILABLE,
  INSTALLER_UPDATE_DISMISSED,
  INSTALLER_UPDATE_DOWNLOADED,
  type ProtocolLaunchRequestedEvent,
  type UpdateAvailableEvent,
  type UpdateDownloadedEvent,
} from "./installer.shared";

interface InstallerState {
  /** Version string of available/downloaded update, or null if none pending. */
  pendingUpdateVersion: string | null;
  /** Whether the update has finished downloading. */
  updateDownloaded: boolean;
  /** Whether user dismissed the update notification. */
  updateDismissed: boolean;
  /** Pending protocol launch request awaiting user decision, or null. */
  protocolRequest: ProtocolLaunchRequestedEvent | null;
}

export const useInstallerStore = create<InstallerState>()(() => ({
  pendingUpdateVersion: null,
  updateDownloaded: false,
  updateDismissed: false,
  protocolRequest: null,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(INSTALLER_UPDATE_AVAILABLE, (payload) => {
      const { version } = payload as UpdateAvailableEvent;
      useInstallerStore.setState({
        pendingUpdateVersion: version,
        updateDownloaded: false,
        updateDismissed: false,
      });
    }),
  );

  unsubs.push(
    onEvent(INSTALLER_UPDATE_DOWNLOADED, (payload) => {
      const { version } = payload as UpdateDownloadedEvent;
      useInstallerStore.setState({
        pendingUpdateVersion: version,
        updateDownloaded: true,
        updateDismissed: false,
      });
    }),
  );

  unsubs.push(
    onEvent(INSTALLER_UPDATE_DISMISSED, () => {
      useInstallerStore.setState({ updateDismissed: true });
    }),
  );

  unsubs.push(
    onEvent(INSTALLER_PROTOCOL_LAUNCH_REQUESTED, (payload) => {
      useInstallerStore.setState({
        protocolRequest: payload as ProtocolLaunchRequestedEvent,
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
