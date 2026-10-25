# Mobile Google Sign-In repair

## Findings

The previous AuthContext explicitly selected `signInWithRedirect()` for iPhone/iPad/Android. The deployed app lives at `pouch-tracker-pi.vercel.app`, while its Firebase `authDomain` is `pouch-tracker-949af.firebaseapp.com`. This is the cross-origin redirect arrangement affected by Safari's third-party storage restrictions. Completing Google/2FA alone does not ensure that the app can recover Firebase's redirect result.

Firebase documents this mechanism and recommends switching to popup sign-in (option 2), or transparently proxying the auth helpers through the app origin (option 3): [official redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices).

Read-only checks of the currently deployed site found:

* All six Firebase `VITE_` values in the public production bundle match the local configuration. Secret/key values were not printed or copied into this document.
* Firebase's public project configuration already lists `pouch-tracker-pi.vercel.app` as authorized, alongside localhost and the project's Firebase domains.
* Direct requests to `/login`, `/__/auth/iframe`, and `/__/firebase/init.json` returned HTTP 404 before this patch. Missing SPA route handling is a separate deployment issue affecting direct navigation/refresh.

These checks do not grant access to Vercel's private settings or the Google Cloud OAuth client configuration. The Safari mechanism is consistent with the observed symptom; no physical iPhone reproduction or live Google/2FA session was performed.

## Code changes

* `src/contexts/AuthContext.tsx`: popup sign-in for all platforms. The popup call occurs directly within the button action, with no preceding persistence await that could lose Safari's user activation. A synchronous lock suppresses overlapping sign-in calls.
* `browserLocalPersistence` is configured during initialization before login is offered. Initialization/redirect consumption is shared across React StrictMode's effect restart. The auth listener controls `loading`; protected routes still wait for the first resolved auth state. The existing AuthGuard already had the correct loading check and did not need a rewrite.
* Existing redirect returns are still consumed. An explicit same-origin redirect records a pending marker; returning without a usable session produces a visible diagnostic. Redirect-result failures do not prevent a fresh popup attempt if persistence initialized successfully. Persistence failures block unpersisted login and remain visible.
* `src/pages/Login.tsx`: adds “Continue in this tab instead” only when HTTPS and the configured Firebase auth domain exactly match the current app host. There is no automatic fallback to cross-origin redirect sign-in.
* `src/utils/authErrors.ts`: keeps readable messages and appends the Firebase error code, including popup blocked/cancelled, unauthorized domain, network failure, unsupported environment and unavailable storage. App-specific diagnostics use `auth/not-initialized`, `auth/redirect-not-configured`, and `auth/redirect-result-missing`.
* `vercel.json`: external auth-helper/init rewrites and SPA rewrites for all existing authenticated routes and `/login`. Helpers are proxied, not redirected or rewritten to the React index. Helper responses request `no-store`. The existing PWA navigation denylist already excludes `/__/`, so the service worker does not substitute the app shell for auth helpers.
* `tests/auth-flows.spec.ts`, `tests/fixtures/auth.ts`: tests use the real AuthProvider, Login, AuthGuard and router with an isolated Firebase SDK boundary double. They never sign into Google or access production Firestore.

Profile initialization still uses the original `ensureUserProfile` transaction. No Firebase project identifiers, user IDs, profile documents, usage entries, pricing, reward records, Firestore rules or indexes are changed by this repair. `.env.local` is unchanged.

## What to do in Vercel/Firebase

### Recommended first deployment: popup flow

Deploy this code, including `vercel.json`, to the existing Vercel project. Keep the six existing Firebase environment values. In particular, keep:

```text
VITE_FIREBASE_AUTH_DOMAIN=pouch-tracker-949af.firebaseapp.com
```

There is no new environment variable. The authorized Vercel domain is already present, so no Firebase console change is expected for the popup flow. Google Sign-In must remain enabled on the same Firebase project. Its existing Google OAuth callback remains:

```text
https://pouch-tracker-949af.firebaseapp.com/__/auth/handler
```

Changing Vite environment variables requires rebuilding/redeploying because they are bundled at build time. An existing `.env.local` on this PC does not update Vercel settings by itself. Verify Production scope and any desired Preview scope separately. Newly generated preview domains are not automatically authorized by Firebase; use the stable production domain for the iPhone test.

After deploying, open the site directly in Safari, reload so the new application/service worker is active, and tap Continue with Google. Keep the Google window/tab open through 2FA. A popup failure now shows its code instead of silently switching into the known broken redirect arrangement.

### If popup sign-in is unsuitable: supported same-origin redirect

The implementation and Vercel proxy are included, but this mode requires coordinated configuration before use:

1. Deploy the included `vercel.json`. Verify `/__/auth/iframe` and `/__/auth/handler` on the Vercel hostname are served by Firebase helpers through the proxy, not a Vercel 404, React index, or HTTP redirect to firebaseapp.com. Both GET and POST forwarding must work. Verify `/__/firebase/init.json` returns the Firebase initialization JSON for the same project.
2. In Google Cloud Console → APIs & Services → Credentials, find the OAuth **Web client used by Firebase Google Sign-In**. Add this Authorized redirect URI exactly, retaining the existing URI:

   ```text
   https://pouch-tracker-pi.vercel.app/__/auth/handler
   ```

   If the web client's JavaScript origins are restricted, include `https://pouch-tracker-pi.vercel.app`. Do not put just the app homepage in the redirect URI field; `/__/auth/handler` is required.
3. Keep `pouch-tracker-pi.vercel.app` in Firebase Authentication → Settings → Authorized domains (already verified present).
4. Set **Vercel Production** `VITE_FIREBASE_AUTH_DOMAIN=pouch-tracker-pi.vercel.app`, then redeploy. Keep every other Firebase value unchanged. Keep the local development auth domain on firebaseapp.com unless you also configure a local HTTPS proxy. Do not apply the production auth domain to arbitrary preview hosts expecting same-origin fallback there.
5. The login screen now exposes “Continue in this tab instead.” Use that explicit action if the popup fails. Redirect helpers and app storage now share the app origin. The ordinary popup action remains available.

The proxy destination in `vercel.json` deliberately points to this existing Firebase project. If the project is ever changed, update that destination too. Do not merely set `authDomain` to the Vercel hostname without the proxy and OAuth URI changes. This follows Firebase option 3 and [Vercel's external rewrite support](https://vercel.com/docs/rewrites).

No production deployment, Vercel environment mutation, authorized-domain mutation or OAuth-client change was performed in this session.

## Validation and manual acceptance

Commands:

```powershell
npx playwright test
npx playwright test tests/auth-flows.spec.ts --browser=webkit
npm run typecheck
npm run build
```

Auth tests cover delayed initialization with an existing session, first observer state, local persistence setup, desktop and iPhone-style popup activation, intended protected-route return, page refresh, sign-out, unauthenticated route protection, visible error codes, persistence failure, legacy redirect error recovery, explicit same-origin HTTPS redirect return, and missing-result diagnostics. Firebase SDK calls are isolated doubles; browser popup/user-activation behavior and React routing run in a real browser engine. WebKit on Windows is not physical iPhone Safari.

Results: all **92 unit/browser regression tests pass** in the default Chromium run, and all **10 auth tests pass in WebKit**. Strict TypeScript and the production/PWA build pass. The build retains the existing non-blocking bundle-size warning. No live OAuth or physical-device test is included in these counts.

After deployment, manually verify on iPhone Safari and a desktop browser:

1. Open `/history` while signed out. It should load the app, then show login rather than a Vercel 404.
2. Sign in with the existing Google account and complete 2FA. Verify the dashboard/history opens and the same stored tracking data appears.
3. Refresh and reopen the tab. The account should restore before protected-route navigation completes. Storage clearing, private-session policies or an explicit sign-out can remove persistence; do not promise persistence when the browser itself clears site data.
4. Sign out in Settings. Refresh an authenticated URL and confirm it returns to login.
5. Test popup cancellation/blocking and verify a readable Firebase code. If using the configured same-origin fallback, complete its full return and repeat refresh/sign-out.
6. Check the installed PWA separately if used. In-app browsers and standalone iOS behavior require device testing; opening the app in Safari is preferable to an embedded social-app browser.

The initial bundle-size warning from Vite is pre-existing and does not fail the build. Live Google authentication, two-factor completion, physical iPhone Safari, and deployed proxy behavior still require the above manual verification.
