# Pouch Tracker

A mobile-first React 19 / strict TypeScript / Vite / Tailwind CSS v4 nicotine tracker with Google authentication, live pouch timing, Toronto spacing goals, editable history, and Forest Green / Ocean Blue themes. Phase 3 adds spending, price snapshots and versioned savings. Phase 4 adds the performance calendar, sleep-aware scores, comparisons and personal bests. Phase 5 adds verified XP, levels, achievements, pouch-free-day rewards and auditable historical corrections.

See the [Phase 5 guide](docs/PHASE5.md) for reward calculations, verification, persistence, correction history, deployment and tests. The [Phase 4 guide](docs/PHASE4.md) covers performance analytics, the [Phase 3 guide](docs/PHASE3.md) describes financial setup, and the [Phase 2 guide](docs/PHASE2.md) describes tracking. Calendar retains bounded entry queries; all-time reward reconciliation runs on Home/Rewards when needed.

## Run locally

Use **Node 24.12 or newer** (the current Firebase SDK requires it) and npm. `.nvmrc` selects Node 24. The lockfile records the installed stable versions.

```powershell
npm ci
# Only if .env.local does not already exist:
Copy-Item .env.example .env.local
# Fill in .env.local with your Firebase web app config.
npm run dev
```

Open the URL printed by Vite. Without configuration, the login screen explains setup and disables sign-in. Restart Vite after environment changes. `npm run typecheck` checks strict TypeScript; `npm run build` checks types and builds to `dist`; `npm run preview` serves that production build locally.

## Firebase configuration

1. Create a project in the [Firebase console](https://console.firebase.google.com/) and register a Web app in Project settings → General.
2. Copy its six web config values into the corresponding `VITE_FIREBASE_*` variables in `.env.local`: API key, auth domain, project ID, storage bucket, messaging sender ID, and app ID. Use the actual values shown by Firebase, including its storage bucket suffix.
3. These are public frontend configuration values. Never add Admin SDK credentials or service-account keys. `.env.local` is ignored by Git.
4. In Authentication → Sign-in method, enable **Google**, choose the project support email, and save. No other provider is needed.
5. In Authentication → Settings → Authorized domains, add `localhost` for desktop development and the actual deployment hostname. New projects may not include localhost by default.

Desktop uses a Google pop-up; iPhone, iPad, and Android use redirect authentication. Sessions persist using Firebase local persistence. Redirect results and errors are handled before the auth listener releases the initial loading state. See [Google Sign-In documentation](https://firebase.google.com/docs/auth/web/google-signin).

### iPhone redirect authentication and hosting

Use Firebase Hosting for the straightforward same-origin setup. Serve the app at `https://YOUR_PROJECT_ID.firebaseapp.com` and set `VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com`. Build after setting this value. Firebase Hosting serves the reserved `/__/auth/` helpers; the service worker explicitly excludes these paths from navigation fallback.

If using your `web.app` hostname or a Firebase Hosting custom domain, set `authDomain` to that exact serving hostname, authorize it in Firebase Auth, and add `https://YOUR_HOST/__/auth/handler` to the Google OAuth client's authorized redirect URIs in Google Cloud Console. Also ensure the app's return URL is allowed. For another hosting provider, implement Firebase's documented same-origin `/__/auth/` proxy (a transparent proxy, not a redirect) or another supported arrangement. Merely authorizing a domain does not solve Safari third-party storage restrictions. Follow [Firebase redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices).

Test mobile sign-in using the deployed HTTPS domain. A phone's LAN HTTP address is not an equivalent test of this flow. No Firebase project or hosting deployment is created automatically by this repository.

## Firestore and security rules

1. In Firebase Console → Firestore Database, create the **default database**, choose a region, and start in production mode.
2. Install and authenticate the Firebase CLI, then deploy this repository's rules to your project:

```powershell
npm install -g firebase-tools
firebase login
firebase deploy --only firestore --project YOUR_PROJECT_ID
```

`firebase.json` points to `firestore.rules` and `firestore.indexes.json`; no `firebase init` is necessary. Phase 3 needs updated rules but no new composite index. Rules require authentication and an exact UID match, validate financial settings, and preserve immutable baseline versions. **Route guards only control the interface; deployed Firestore rules protect data.** See [Firestore rules documentation](https://firebase.google.com/docs/firestore/security/get-started).

After authentication, a transaction creates missing profile, preferences, and schedule documents. Existing documents are left untouched. Profile initialization failures show a retry action. No nicotine records are seeded.

```text
users/{uid}                         UserProfile (legacy profile settings retained)
  entries/{entryId}                UsageEntry
  settings/preferences            Theme, timezone, currency, last cigar price
  settings/schedule               Calendar-date spacing steps and timezone
  settings/pricing                Current pouch/cigarette pack-price snapshots
  settings/baselineState          Latest baseline effective date
  baselines/{effectiveDate}        Immutable savings baseline versions
  coverage/{date}                 Explicit complete-day confirmations
  prices/{priceId}                 ProductPrice (future)
  weeklyGoals/{goalId}             WeeklySpacingGoal (legacy future reference)
  progress/current                Progress (future)
  achievements/{achievementId}     Achievement (future)
```

Settings use the settings subcollection. Current financial schema, validation, and manual checks are in [docs/PHASE3.md](docs/PHASE3.md).

## Hosting and installation

```powershell
npm run build
firebase deploy --only hosting --project YOUR_PROJECT_ID
```

The included hosting config serves SPA routes. In iPhone Safari, open the deployed HTTPS site and choose Share → Add to Home Screen. The manifest includes standalone mode, 192/512 PNG icons, and a maskable icon; Apple metadata and a 180px touch icon are included. The service worker precaches only build assets, with no runtime caching of auth or Firestore requests. Firebase's own session persistence is separate from the service worker. No persistent Firestore cache is enabled. Firestore can queue writes in memory while the tab stays open; pending writes are not guaranteed to survive closure or refresh.

## Foundation structure

This is the original Phase 1 inventory. The complete Phase 2 additions and modifications are listed in [docs/PHASE2.md](docs/PHASE2.md).

```text
PouchTracker/
├── .env.example
├── .gitignore
├── .nvmrc
├── README.md
├── firebase.json
├── firestore.rules
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── playwright.config.ts
├── tests/
│   └── foundation.spec.ts
├── public/
│   ├── favicon.svg
│   ├── apple-touch-icon.png
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable.png
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── styles.css
    ├── components/
    │   ├── AuthGuard.tsx
    │   ├── layout/
    │   │   ├── AppLayout.tsx
    │   │   └── Navigation.tsx
    │   └── ui/
    │       ├── EmptyState.tsx
    │       ├── LoadingState.tsx
    │       ├── PageHeader.tsx
    │       └── StatCard.tsx
    ├── contexts/AuthContext.tsx
    ├── hooks/useAuth.ts
    ├── lib/firebase.ts
    ├── pages/
    │   ├── Home.tsx
    │   ├── Calendar.tsx
    │   ├── History.tsx
    │   ├── Stats.tsx
    │   ├── Rewards.tsx
    │   ├── Settings.tsx
    │   ├── Login.tsx
    │   └── NotFound.tsx
    ├── services/userData.ts
    ├── types/data.ts
    └── utils/authErrors.ts
```

Generated output (`dist/`), installed dependencies (`node_modules/`), and test results are ignored. The gRPC override selects the patched compatible dependency used by Firebase's Node distribution.

## Verification

```powershell
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

The automated browser suite isolates Firebase at the service boundary, so it can run with your local environment configuration without creating real records. It includes scheduling, date, timer, finance, tracking, theme, navigation, and chart tests. `npm run test:rules` separately validates Firestore rules against a local demo-project emulator (Firebase CLI and Java 21+ required). See [Phase 3 verification details](docs/PHASE3.md#validation-and-manual-checks) for coverage and limits. Google OAuth, actual cross-device synchronization, production deployment, and physical iPhone behaviour still require live verification.
#   P o u c h T r a c k e r  
 