# Known issues

## Bitwarden can remain on Edit after saving a newly created item

**Status:** Known upstream behavior, accepted for initial Bitwarden support.
Last reproduced on 2026-09-16 with the unmodified Bitwarden 2026.8.0 extension.

### Reproduction and impact

1. Create and save a login in the Bitwarden popup.
2. Without closing the popup, select **Edit** on the newly created item.
3. Change its password and select **Save**.

The edit saves successfully, but the popup can remain on the Edit screen instead
of returning to the item view. Ordinary existing-item edits and new-item creation
pass the acceptance tests; the failure concerns this consecutive sequence.

**Workaround:** Close the popup, switch browser tabs, and reopen Bitwarden to
restore normal navigation. The saved change does not need to be entered again.

### Findings and scope

The same failure was reproduced in Chiaroscuro on Electron 44.3.0 and in the
native extension popup of Google Chrome for Testing 153.0.8010.12 on Linux,
using a disposable Vaultwarden 1.37.2 account. The Chrome control contained no
Chiaroscuro compatibility code. Both received a successful HTTP 200 response for
the edit and remained on the Edit route. This comparison did not use a real
Bitwarden cloud account or a released stable Chrome build.

Source-map inspection points to Bitwarden clearing its popup navigation history
after creating an item. The next edit's return navigation can then restore the
cached Edit route. The exact upstream correction has not been implemented or
validated; an upstream report has not yet been filed.

Chiaroscuro keeps the official extension code unchanged. An upstream fix is
preferred; maintaining a Bitwarden-specific navigation patch would require a
separate scope decision. This issue is documented in
[PR #65](https://github.com/MortenChristiansenOrg/chiaroscuro2/pull/65).
