/** Local document formats supported by the browser. */
export function isBrowserFile(filePath: string): boolean {
  return /\.(html?|mhtml|svg|pdf)$/i.test(filePath);
}
