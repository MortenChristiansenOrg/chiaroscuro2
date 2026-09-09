# Investigating overnight GitHub logout

The first-tab user-agent defect is fixed by preparing the session before constructing
web contents, including Electron’s app fallback used by renderer-created popups.
This does not establish why GitHub loses authentication overnight.
A synthetic persistent-cookie restart test also cannot establish sleep/wake behavior.
Keep issue #49 open until an actual logout transition is captured and explained.

The app retains the latest 500 GitHub authentication observations in memory. Enable
the existing debug server in Settings and inspect its configured local port (default
19400):

```sh
curl 'http://127.0.0.1:19400/state/github-session?pretty' > github-session.json
```

Automation instances require their own bearer token. The existing Host/Origin and
local access restrictions apply. The diagnostic buffer is discarded on process exit;
export it after the failure and before restarting. No network traffic is generated
by the diagnostics, and they do not change cookies, headers, or server responses.

The timeline contains:

- Session persistence and browser user-agent identity.
- Presence/expiry metadata and change/removal reasons for `user_session`,
  `__Host-user_session_same_site`, `logged_in`, `dotcom_user`, and `_gh_sess` cookies
  scoped to `github.com`.
- Which of those names appeared in the final outgoing Cookie header for top-level
  GitHub requests, the sent and tab user agents, and the native request ID.
- Redirect categories and response statuses correlated by request ID. Paths are
  reduced to `sign-in`, `session`, `github-page`, or `external`.
- Cookie snapshots at initialization, suspend, resume, and a sign-in redirect.
  `startedAt` records when each asynchronous snapshot began; its entry timestamp is
  completion time. A suspend snapshot may not finish until Windows resumes.

Cookie values, authentication headers, request bodies, full paths/URLs, query
parameters, and account/repository names are never retained. Only the User-Agent
header and allowlisted cookie-name presence are recorded. Other cookies and
subresource requests are ignored. Request observers own `onSendHeaders`,
`onBeforeRedirect`, and `onCompleted` for the observed session; Electron supports one
listener per event, so future network observers must compose with these handlers.

To diagnose a failure, compare the last successful request with the request preceding
a sign-in redirect:

1. If cookies vanished, inspect `cookie-changed` removal causes and expiration times.
2. If cookies exist but were not sent, investigate cookie scope, SameSite/secure
   rules, and the request context.
3. If cookies were sent but a sign-in redirect followed, investigate server-side
   session invalidation and request differences. A redirect alone does not prove
   user-agent rejection.

Validation covers local first/subsequent tabs, sub-tabs, a simulated OAuth popup,
actual outgoing user agents, real Electron cookie events, and persistent cookies
across normal restart. Unit tests cover redaction, cookie removal, redirect
correlation, and a simulated resume snapshot. Real GitHub authentication and an
actual overnight Windows sleep/wake transition still require capture.
