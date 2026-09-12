# Channel icon assets

`icon-early-access.png` / `.ico`: amber Early Access variant.
`icon-dev.png` / `.ico`: blue development variant.

Both variants were created with the built-in image generation tool using
`resources/icon.png` as the edit target. Prompt for each: preserve the tall narrow
handwritten white C, its scale and placement; change the background to dark amber
(`#9a5700`) or deep blue (`#1557b0`); flat square Windows icon, no added symbols or
text, legible at 16px. The original stable assets are unchanged.

To re-encode a new generated source, use
`bun scripts/convert-app-icon.ts source.png resources/icon-variant` (requires
FFmpeg). This writes the 512px PNG and a multiresolution ICO. The utility is only
for asset maintenance; normal builds use the committed files.

Preview the actual assets at small sizes in the design system's Icons page.
