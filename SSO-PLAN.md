# SSO Fix Plan

## Problem

Azure AD Conditional Access error 53000 when accessing portal.azure.com. Device compliance check fails. Worked in old WebView2 app with `AllowSingleSignOnUsingOSPrimaryAccount`.

## Root Cause

WebView2's `AllowSingleSignOnUsingOSPrimaryAccount` uses WAM (Web Account Manager) — provides PRT-based SSO + device compliance attestation + full device identity. Electron's `CloudAPAuthEnabled` uses Chromium's Cloud AP plugin which injects PRT cookies but:

1. Vanilla Chromium may lack device compliance attestation that Edge/WebView2 provides via WAM
2. Electron user-agent (`Electron/40.x`) is **not recognized as a supported browser** by Azure AD Conditional Access — Microsoft only trusts Edge, Chrome, Firefox, Safari
3. WebView2 identifies as Edge, which Azure AD trusts

## Phase 1 — User-Agent override for Microsoft auth domains

High likelihood of fixing the issue if Conditional Access is gating on browser identity.

- Override user-agent on Microsoft auth domains only:
  - `login.microsoftonline.com`
  - `login.microsoft.com`
  - `device.login.microsoftonline.com`
  - `*.microsoft.com`
- Use `session.webRequest.onBeforeSendHeaders` to selectively swap user-agent to Edge's string
- Keep Electron user-agent for all other sites
- Apply on default session at boot (alongside existing SSO flag setup)
- Make this conditional on Azure AD SSO being enabled
- Add a setting toggle or just bundle it with the existing Azure AD toggle

### Implementation

- In `src/main/index.ts`: after `app.whenReady()`, if `ssoBootState.azureAd`, register a `webRequest.onBeforeSendHeaders` filter on the default session that rewrites `User-Agent` for matching domains
- Edge UA string: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chromiumVersion} Safari/537.36 Edg/{chromiumVersion}`
- Get Chromium version from `process.versions.chrome` to keep it aligned with Electron's actual engine

## Phase 2 — Additional Chromium features

If Phase 1 insufficient, research & test additional flags:

- `WebAuthenticationBroker` — Windows auth broker integration
- Device-bound session credentials
- Other Cloud AP related features in Chromium 136 (Electron 40's engine)

## Phase 3 — Native WAM integration

Last resort. Build a native Node addon that calls WAM APIs directly for token acquisition with device claims. Significantly more complex.

## Unresolved Questions

1. Is the Conditional Access policy checking browser identity (user-agent), device compliance, or both? Azure AD sign-in logs would show the exact failure reason.
2. Should the user-agent override apply to all sites or only Microsoft auth domains?
3. Does the PRT cookie (`x-ms-RefreshTokenCredential`) actually flow correctly with `CloudAPAuthEnabled` in Electron 40, or is it silently failing?
