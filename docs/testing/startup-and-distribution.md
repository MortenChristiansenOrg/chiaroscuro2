# Startup and distribution measurements

Measured September 16, 2026 against main `2a8a535`, Electron 44.3.0.

## Distribution

Cross-packaged Windows x64 directories, same source baseline, Electron version,
release identity (`v0.10.0-beta.3`) and executable editing disabled for both:

| Payload | Before | After |
| --- | ---: | ---: |
| Full unpacked directory | 503.82 MiB | 347.49 MiB |
| Reduction | | 156.33 MiB (31.0%) |

RxDB and its runtime tree are retained. Renderer-only package trees and unused
native canvas binaries are absent; PDF worker, icon fonts and dependency license
notices are retained. Chromium locales are limited to English (US/GB) and Danish.
The native Windows release runner has a different optional-dependency tree;
its exact size and compressed installer savings can differ from this WSL build.
The afterPack gate verifies the actual archive and locales on either host.

To reproduce an unpacked build without signing/editing the executable:

```sh
bun run build
bun -e 'import { build, Platform, Arch } from "electron-builder"; import { releaseConfig } from "./scripts/release-config"; await build({targets: Platform.WINDOWS.createTarget(["dir"], Arch.x64), config:{...releaseConfig("v0.10.0-beta.3"), directories:{output:"dist/size-check"}, win:{signAndEditExecutable:false}}, publish:"never"});'
```

## Startup

Five fresh isolated profiles per tab count, local fixture site, warm filesystem
caches, WSL/Linux Ozone headless. Controller launch and observation overhead is
included. This harness keeps debug recording enabled and does not initialize the
production updater or palette window, so it isolates native tab restoration.

| Saved tabs | Baseline median | Optimized median | Repeat baseline | Repeat optimized |
| --- | ---: | ---: | ---: | ---: |
| 0 | 490 ms | 490 ms | 541 ms | 605 ms |
| 20 | 555 ms | 601 ms | 613 ms | 637 ms |
| 100 | 756 ms | 514 ms | 798 ms | 637 ms |

The first optimized series overlapped packaging; the repeat series ran without
build/test workloads. Only the large-profile result is consistently significant:
100 saved tabs improved by 161–242 ms (20–32%). There is no demonstrated
small-profile startup win. Native WebContents count for 100 tabs drops from 102
to 3; median aggregate working set falls by roughly 27–28 MiB. This is not one
renderer process per dormant tab, and memory savings must not be extrapolated
as if it were.

With enabled extensions, dormant views are materialized before loading extension
code to preserve native tab IDs and complete `chrome.tabs` inventories. Those
profiles do not get the dormant-view memory reduction. A future change to the
extension tab identity model would be needed to safely remove that constraint.

Native Windows, same five-run diagnostic and warm caches, without concurrent
build/test workloads:

| Saved tabs | Baseline median | Optimized median |
| --- | ---: | ---: |
| 0 | 474 ms | 489 ms |
| 20 | 568 ms | 580 ms |
| 100 | 704 ms | 564 ms |

The Windows 100-tab profile improves by 140 ms (20%), and median working set
drops from 714,860 KiB to 659,748 KiB (53.8 MiB). Small profiles again show no
demonstrated speedup. These are isolated native Windows test launches, not
packaged cold starts. The baseline used the main bundle from the baseline
archive with the identical renderer, dependencies and diagnostic harness.

First loading the updater module separately in real Electron processes costs
roughly 33–41 ms on Linux and 57–62 ms on Windows. Production now defers that work until the existing
three-second check deadline, or initializes immediately for a manual check.
This is a module-load measurement, not a measured packaged startup delta.

The recorder microbenchmark (five runs, 1,000 events containing 100 tabs each)
took a median 104 ms with recording enabled and 0.019 ms disabled. This removes
JSON-copy work and retained history while diagnostics are off; the synthetic
workload does not imply a 104 ms saving on every launch.

Tooltip and palette prewarming remain unchanged: no startup optimization adds
window creation or page loading to their first user interaction.

Reproduction commands and fixture limitations are in
[agent verification](agent-verification.md#startup-diagnostics).
