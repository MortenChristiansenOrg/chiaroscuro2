import { assertFreshBuild, SKIP_BUILD_CHECK_ENV } from "../../scripts/build-stamp";

/** Stop the run once, before any worker starts, when out/ is older than the sources. */
export default function globalSetup(): void {
  if (process.env.CHIAROSCURO_PACKAGED_EXECUTABLE) return;
  assertFreshBuild(process.cwd());
  // Workers inherit this; the run is checked, so an edit during a long run cannot fail it midway.
  process.env[SKIP_BUILD_CHECK_ENV] = "1";
}
