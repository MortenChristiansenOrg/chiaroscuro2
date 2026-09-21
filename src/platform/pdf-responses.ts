import type { Session, WebContents } from "electron";

function withoutFragment(url: string): string {
  return url.split("#", 1)[0] ?? url;
}

/** Remember PDF responses for URLs that do not advertise their file type. */
export class PdfResponses {
  private readonly urls = new WeakMap<WebContents, string>();

  observe(session: Session): void {
    // Electron permits one listener per webRequest event. Keep this observer
    // composed with any future onResponseStarted consumers.
    session.webRequest.onResponseStarted((details) => {
      const contents = details.webContents;
      if (details.resourceType !== "mainFrame" || !contents) return;
      this.urls.delete(contents);
      const header = (name: string) =>
        Object.entries(details.responseHeaders ?? {})
          .find(([key]) => key.toLowerCase() === name)?.[1]?.[0]
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
      if (
        details.statusCode >= 200 &&
        details.statusCode < 300 &&
        header("content-type") === "application/pdf" &&
        header("content-disposition") !== "attachment"
      ) {
        this.urls.set(contents, details.url);
      }
    });
  }

  getUrl(contents: WebContents): string | undefined {
    const url = this.urls.get(contents);
    // Ignore responses from an earlier navigation, while allowing PDF #page links.
    return url && withoutFragment(contents.getURL()) === withoutFragment(url)
      ? contents.getURL()
      : undefined;
  }
}
