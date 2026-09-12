import { appendFileSync } from "node:fs";
import { releaseTag } from "../src/shared/app-channel";

const release = releaseTag(process.env.RELEASE_TAG ?? "");
if (process.env.GITHUB_EVENT_NAME === "push" && release.channel !== "stable") {
  throw new Error("Early Access is published only through Run workflow");
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `tag=${release.tag}\nchannel=${release.channel}\nprerelease=${release.channel === "early-access"}\n`,
  );
}
console.log(`${release.tag}: ${release.channel}`);
