import { logWarn } from "../../shared/log";

/**
 * The parts of electron-updater's `BaseUpdater` (`NsisUpdater` on Windows) used to start the
 * installer. `installerPath`, `quitAndInstallCalled` and `spawnLog` are protected there.
 */
export interface InstallingUpdater {
  autoRunAppAfterInstall: boolean;
  install(isSilent?: boolean, isForceRunAfter?: boolean): boolean;
  readonly installerPath?: string | null;
  quitAndInstallCalled?: boolean;
  spawnLog?: (cmd: string, args?: string[], env?: unknown, stdio?: unknown) => Promise<boolean>;
}

interface Attempt {
  promise: Promise<void>;
  /** The latest process start electron-updater requested for this attempt. */
  spawn?: Promise<boolean>;
  /** Within `install()`: errors electron-updater reports now are about this attempt. */
  installing: boolean;
  /** The latest process start failed and electron-updater is reporting it or retrying. */
  spawnFailed: boolean;
  settled: boolean;
  launched(): void;
  failed(error: unknown): void;
}

function errorCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A failure to start the installer, described for the user. */
class LaunchFailure extends Error {}

/** What to tell the user. Node's process start errors name the full installer path instead. */
function launchFailure(error: unknown): string {
  if (error instanceof LaunchFailure) return error.message;
  const code = errorCode(error);
  const message = errorMessage(error);
  if (typeof code !== "string" || !message.startsWith("spawn "))
    return `The update installer could not start: ${message}`;
  if (code === "EACCES" || code === "EPERM")
    return "The update installer was blocked from starting.";
  return `The update installer could not start (${code}).`;
}

/**
 * Starts electron-updater's installer and settles once it is known whether the installer
 * process started, so the browser quits only then.
 *
 * electron-updater's `quitAndInstall()` quits right after requesting the start, but the process
 * starts asynchronously (`doInstall` → `spawnLog`), so a failure arrives too late. This calls
 * `install()` instead and follows each `spawnLog` it makes: a started process means launched.
 * `doInstall` retries `EACCES`/`UNKNOWN` through `elevate.exe` (followed as the next spawn) and
 * reports other failures as an `error` event, which `fail` attributes to the attempt only while
 * a failure of the attempt is being reported. For `ENOENT` it would open the installer with the
 * shell and never report the outcome, so that is done here instead.
 */
export class InstallerLauncher {
  private attempt: Attempt | undefined;
  /** The installer started; electron-updater will not start it again. */
  private started = false;
  /** The feature stopped; stop following process starts once a launch in progress settled. */
  private disposed = false;
  private readonly restoreSpawn: () => void;

  constructor(
    private readonly updater: InstallingUpdater,
    private readonly openPath: (path: string) => Promise<void>,
  ) {
    const spawnLog = updater.spawnLog;
    if (typeof spawnLog !== "function") {
      this.restoreSpawn = () => {};
      return;
    }
    const hadOwn = Object.hasOwn(updater, "spawnLog");
    updater.spawnLog = (cmd, args, env, stdio) => {
      const spawn = spawnLog.call(updater, cmd, args, env, stdio);
      const attempt = this.attempt;
      return attempt ? this.follow(attempt, cmd, spawn) : spawn;
    };
    this.restoreSpawn = () => {
      if (hadOwn) updater.spawnLog = spawnLog;
      else delete updater.spawnLog;
    };
  }

  /**
   * Start the installer. Resolves once its process started; rejects if it could not start, in
   * which case the update stays ready for another attempt or to install on quit.
   */
  launch(): Promise<void> {
    if (this.started) return Promise.resolve();
    if (this.attempt) return this.attempt.promise;
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const settle = () => {
      if (attempt.settled) return false;
      attempt.settled = true;
      if (this.attempt === attempt) this.attempt = undefined;
      if (this.disposed) this.restoreSpawn();
      return true;
    };
    const attempt: Attempt = {
      promise,
      installing: true,
      spawnFailed: false,
      settled: false,
      launched: () => {
        if (!settle()) return;
        this.started = true;
        resolve();
      },
      failed: (error) => {
        if (!settle()) return;
        // install() ignores later calls once it ran, and the quit handler then skips installing.
        // The installer did not start, so the update is still pending.
        this.updater.quitAndInstallCalled = false;
        logWarn("installer", "start update installer")(error);
        reject(new Error(launchFailure(error)));
      },
    };
    this.attempt = attempt;
    let requested = false;
    try {
      // As quitAndInstall() does: show the installer and start the browser after installing.
      requested = this.updater.install(false, this.updater.autoRunAppAfterInstall);
    } catch (error) {
      attempt.failed(error);
    } finally {
      attempt.installing = false;
    }
    // A failure electron-updater reported has already ended the attempt with its error.
    if (!requested) attempt.failed(new Error("The update could not be installed."));
    // electron-updater started the installer some other way; trust it, as quitAndInstall() does.
    else if (!attempt.spawn) attempt.launched();
    return attempt.promise;
  }

  /**
   * An error electron-updater reported. Returns whether it is a failure of the launch in
   * progress, and so reported by `launch()`. Errors of update checks and downloads running at
   * the same time are not.
   */
  fail(error: unknown): boolean {
    const attempt = this.attempt;
    if (!attempt) return false;
    if (attempt.installing) {
      attempt.failed(error);
      return true;
    }
    // The failed process start ends the attempt itself unless electron-updater retries.
    return attempt.spawnFailed;
  }

  /**
   * Stop following electron-updater's process starts. A launch in progress is still followed,
   * including an elevated retry, so its outcome stays known to electron-updater's quit handler.
   */
  dispose(): void {
    this.disposed = true;
    if (!this.attempt) this.restoreSpawn();
  }

  private async follow(attempt: Attempt, cmd: string, spawn: Promise<boolean>): Promise<boolean> {
    attempt.spawn = spawn;
    attempt.spawnFailed = false;
    try {
      const started = await spawn;
      attempt.launched();
      return started;
    } catch (error) {
      let failure = error;
      if (errorCode(error) === "ENOENT" && cmd === this.updater.installerPath) {
        try {
          await this.openPath(cmd);
          attempt.launched();
          return true;
        } catch (openError) {
          logWarn("installer", "open update installer")(openError);
          // Without a code, electron-updater reports this as an error instead of opening it.
          failure = new LaunchFailure("The update installer is missing or could not be opened.");
        }
      }
      // electron-updater now either starts another process right away or reports the error.
      // Unless it started another one, this failure ends the attempt.
      attempt.spawnFailed = true;
      setTimeout(() => {
        if (attempt.spawn === spawn) attempt.failed(failure);
      }, 0);
      throw failure;
    }
  }
}
