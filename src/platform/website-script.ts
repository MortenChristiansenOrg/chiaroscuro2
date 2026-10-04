import type { WebContents } from "electron";

/** Scripts get page APIs and a lexical clipboard helper, never a privileged IPC bridge. */
export function websiteScriptCode(source: string, expectedUrl: string): string {
  return `(async () => {
    if (location.href !== ${JSON.stringify(expectedUrl)}) throw new Error('The page changed before the script could run.');
    let clipboard;
    const copy = (text) => { clipboard = String(text); };
    await (async function(copy) {\n${source}\n})(copy);
    return clipboard === undefined ? {} : { clipboard };
  })()`;
}

export async function runWebsiteScript(
  contents: WebContents | undefined,
  options: { source: string; expectedUrl: string; userGesture: boolean },
): Promise<{ clipboard?: string }> {
  if (
    !contents ||
    contents.isDestroyed() ||
    contents.getURL() !== options.expectedUrl ||
    contents.isLoadingMainFrame()
  ) {
    throw new Error("The page is unavailable or still loading.");
  }
  const frame = contents.mainFrame;
  let changed = false;
  let rejectChange: (error: Error) => void = () => {};
  const navigation = new Promise<never>((_resolve, reject) => {
    rejectChange = reject;
  });
  const invalidate = () => {
    changed = true;
    rejectChange(new Error("The page changed while the script was running."));
  };
  const onNavigation = (
    event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
  ) => {
    if (event.isMainFrame) invalidate();
  };
  contents.on("did-start-navigation", onNavigation);
  contents.once("destroyed", invalidate);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("The script did not finish within 10 seconds.")),
        10_000,
      );
    });
    const result = await Promise.race([
      frame.executeJavaScript(
        websiteScriptCode(options.source, options.expectedUrl),
        options.userGesture,
      ),
      navigation,
      deadline,
    ]);
    if (
      changed ||
      contents.isDestroyed() ||
      frame.isDestroyed() ||
      contents.mainFrame !== frame ||
      contents.getURL() !== options.expectedUrl
    ) {
      throw new Error("The page changed while the script was running.");
    }
    if (typeof result !== "object" || result === null || !("clipboard" in result)) return {};
    return typeof result.clipboard === "string" ? { clipboard: result.clipboard } : {};
  } finally {
    if (timer) clearTimeout(timer);
    contents.removeListener("did-start-navigation", onNavigation);
    contents.removeListener("destroyed", invalidate);
  }
}
