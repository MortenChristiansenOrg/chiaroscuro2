import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertFreshBuild,
  beginBuildStamp,
  checkBuild,
  commitBuildStamp,
  diffFingerprints,
  PENDING_STAMP_FILE,
  STAMP_FILE,
} from "./build-stamp";

let root = "";

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function build(): void {
  beginBuildStamp(root);
  write("out/main/index.js", "main();\n");
  write("out/renderer/index.html", "<html></html>\n");
  commitBuildStamp(root, new Date("2026-01-02T03:04:05.000Z"));
}

function reason(): string {
  const result = checkBuild(root);
  if (result.fresh) throw new Error("Expected a stale build");
  return result.reason;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "build-stamp-"));
  write("src/main/index.ts", "export const a = 1;\n");
  write("src/shared/types.ts", "export type A = string;\n");
  write("package.json", "{}\n");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("build stamp", () => {
  it("reports a build made from the current sources as fresh", () => {
    build();

    expect(checkBuild(root)).toEqual({ fresh: true });
    expect(fs.existsSync(path.join(root, PENDING_STAMP_FILE))).toBe(false);
  });

  it("reports a missing stamp as stale", () => {
    write("out/main/index.js", "main();\n");

    expect(reason()).toContain(`${STAMP_FILE} is missing`);
  });

  it("leaves no stamp when the build does not finish", () => {
    build();
    beginBuildStamp(root);

    expect(reason()).toContain("is missing");
  });

  it("names changed, added and removed sources", () => {
    build();
    write("src/main/index.ts", "export const a = 2;\n");
    write("src/main/new.ts", "export {};\n");
    fs.rmSync(path.join(root, "src/shared/types.ts"));

    expect(reason()).toBe(
      "The build in out/ (2026-01-02T03:04:05.000Z) is older than the sources: src/main/index.ts changed, src/main/new.ts added, src/shared/types.ts removed.",
    );
  });

  it("ignores unit tests and test utilities", () => {
    build();
    write("src/main/index.test.ts", "it();\n");
    write("src/renderer/App.test.tsx", "it();\n");
    write("src/test-utils/factories.ts", "export {};\n");

    expect(checkBuild(root)).toEqual({ fresh: true });
  });

  it("matches a checkout whose line endings were converted to CRLF", () => {
    build();
    write("src/main/index.ts", "export const a = 1;\r\n");

    expect(checkBuild(root)).toEqual({ fresh: true });
  });

  it("keeps line endings in binary files", () => {
    write("resources/icon.png", "\u0000PNG\r\n");
    build();
    write("resources/icon.png", "\u0000PNG\n");

    expect(reason()).toContain("resources/icon.png changed");
  });

  it("reports outputs rewritten after the build as stale", () => {
    build();
    write("out/main/index.js", "devMain();\n");

    expect(reason()).toBe(
      "out/ was modified after bun run build (for example by bun dev): out/main/index.js changed.",
    );
  });

  it("ignores other files in out/", () => {
    build();
    write("out/verification/cli.mjs", "cli();\n");

    expect(checkBuild(root)).toEqual({ fresh: true });
  });

  it("refuses to commit without a snapshot of the inputs", () => {
    expect(() => commitBuildStamp(root)).toThrow(PENDING_STAMP_FILE);
  });
});

describe("assertFreshBuild", () => {
  it("tells how to rebuild", () => {
    expect(() => assertFreshBuild(root, {})).toThrow(
      /Stale build: .*\nRun bun run build and retry/,
    );
  });

  it("can be skipped explicitly", () => {
    expect(() => assertFreshBuild(root, { CHIAROSCURO_SKIP_BUILD_CHECK: "1" })).not.toThrow();
  });
});

describe("diffFingerprints", () => {
  it("lists every kind of difference", () => {
    expect(diffFingerprints({ a: "1", b: "2", c: "3" }, { a: "1", b: "x", d: "4" })).toEqual({
      changed: ["b"],
      added: ["d"],
      removed: ["c"],
    });
  });
});

describe("describing many differences", () => {
  it("shortens the list", () => {
    build();
    for (const name of ["a", "b", "c", "d", "e", "f", "g"]) write(`src/${name}.ts`, "");

    expect(reason()).toMatch(/src\/e\.ts added and 2 more\.$/);
  });
});
