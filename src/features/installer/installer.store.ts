import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import {
  INSTALLER_APPLY_UPDATE,
  INSTALLER_PROTOCOL_LAUNCH_REQUESTED,
  INSTALLER_UPDATE_AVAILABLE,
  INSTALLER_UPDATE_DISMISSED,
  INSTALLER_UPDATE_DOWNLOADED,
  INSTALLER_UPDATE_ERROR,
  type InstallerEvents,
  type ProtocolLaunchRequestedEvent,
} from "./installer.shared";

interface InstallerState {
  /** Version string of available/downloaded update, or null if none pending. */
  pendingUpdateVersion: string | null;
  /** Whether the update has finished downloading. */
  updateDownloaded: boolean;
  /** Remains true after command acknowledgement until exit or an update error. */
  updateApplying: boolean;
  /** Whether user dismissed the update notification. */
  updateDismissed: boolean;
  /** Error message if the update failed, or null. */
  updateError: string | null;
  /** Pending protocol launch request awaiting user decision, or null. */
  protocolRequest: ProtocolLaunchRequestedEvent | null;
}

export const useInstallerStore = create<InstallerState>()(() => ({
  pendingUpdateVersion: null,
  updateDownloaded: false,
  updateApplying: false,
  updateDismissed: false,
  updateError: null,
  protocolRequest: null,
}));

/** Show immediate feedback and prevent duplicate requests throughout shutdown. */
export async function applyUpdate(): Promise<void> {
  const state = useInstallerStore.getState();
  if (state.updateApplying || !state.updateDownloaded) return;
  useInstallerStore.setState({ updateApplying: true, updateError: null, updateDismissed: false });
  try {
    await window.chiaroscuro.sendCommand(INSTALLER_APPLY_UPDATE, undefined);
    // Acknowledgement only means installation was requested; keep feedback until exit.
  } catch (error) {
    useInstallerStore.setState({
      updateApplying: false,
      updateError:
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : String(error),
    });
  }
}

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<InstallerEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(INSTALLER_UPDATE_AVAILABLE, ({ version }) => {
      if (useInstallerStore.getState().updateApplying) return;
      useInstallerStore.setState({
        pendingUpdateVersion: version,
        updateDownloaded: false,
        updateDismissed: false,
        updateError: null,
      });
    }),
  );

  unsubs.push(
    on(INSTALLER_UPDATE_DOWNLOADED, ({ version }) => {
      useInstallerStore.setState({
        pendingUpdateVersion: version,
        updateDownloaded: true,
        updateDismissed: false,
        updateError: null,
      });
    }),
  );

  unsubs.push(
    on(INSTALLER_UPDATE_ERROR, ({ message }) => {
      useInstallerStore.setState({ updateError: message, updateApplying: false });
    }),
  );

  unsubs.push(
    on(INSTALLER_UPDATE_DISMISSED, () => {
      if (useInstallerStore.getState().updateApplying) return;
      useInstallerStore.setState({ updateDismissed: true });
    }),
  );

  unsubs.push(
    on(INSTALLER_PROTOCOL_LAUNCH_REQUESTED, (payload) => {
      useInstallerStore.setState({ protocolRequest: payload });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
