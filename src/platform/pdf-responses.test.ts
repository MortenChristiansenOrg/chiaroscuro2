import type { OnResponseStartedListenerDetails, Session, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { PdfResponses } from "./pdf-responses";

function setup() {
  const onResponseStarted = vi.fn();
  const tracker = new PdfResponses();
  tracker.observe({ webRequest: { onResponseStarted } } as unknown as Session);
  const respond = onResponseStarted.mock.calls[0]?.[0] as (
    details: OnResponseStartedListenerDetails,
  ) => void;
  const getURL = vi.fn(() => "https://example.test/document?id=42");
  const contents = { getURL } as unknown as WebContents;
  const response: OnResponseStartedListenerDetails = {
    id: 1,
    method: "GET",
    referrer: "",
    timestamp: Date.now(),
    fromCache: false,
    statusLine: "HTTP/1.1 200 OK",
    webContents: contents,
    url: getURL(),
    resourceType: "mainFrame",
    statusCode: 200,
    responseHeaders: { "Content-Type": ["application/pdf"] },
  };
  return { tracker, respond, contents, getURL, response };
}

describe("PDF response detection", () => {
  it("recognizes extensionless PDF responses and keeps navigation fragments", () => {
    const { tracker, respond, contents, getURL, response } = setup();
    respond({
      ...response,
      responseHeaders: { "cOnTeNt-TyPe": ["Application/PDF; charset=binary"] },
    });
    getURL.mockReturnValue(`${response.url}#page=2`);
    expect(tracker.getUrl(contents)).toBe(`${response.url}#page=2`);
  });

  it.each([
    { resourceType: "subFrame" },
    { resourceType: "xhr" },
    { statusCode: 302 },
    { statusCode: 404 },
    { responseHeaders: { "Content-Type": ["text/html"] } },
    {
      responseHeaders: {
        "Content-Type": ["application/pdf"],
        "Content-Disposition": ['Attachment; filename="download.pdf"'],
      },
    },
  ])("does not replace tabs for embedded PDFs, downloads or non-PDF responses: %j", (changes) => {
    const { tracker, respond, contents, response } = setup();
    respond({ ...response, ...changes } as OnResponseStartedListenerDetails);
    expect(tracker.getUrl(contents)).toBeUndefined();
  });

  it("does not reuse PDF detection after navigation or a non-PDF reload of the same URL", () => {
    const { tracker, respond, contents, getURL, response } = setup();
    respond(response);
    getURL.mockReturnValue("https://example.test/other");
    expect(tracker.getUrl(contents)).toBeUndefined();
    getURL.mockReturnValue(response.url);
    respond({ ...response, responseHeaders: { "Content-Type": ["text/html"] } });
    expect(tracker.getUrl(contents)).toBeUndefined();
  });

  it("keeps the main document identity when a subresource finishes loading", () => {
    const { tracker, respond, contents, response } = setup();
    respond(response);
    respond({ ...response, url: "https://example.test/image", resourceType: "image" });
    expect(tracker.getUrl(contents)).toBe(response.url);
  });
});
