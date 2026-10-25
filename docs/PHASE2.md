# Phase 2: tracking, spacing, and themes

The existing shell has been extended with one-tap pouch/cigarette logging, three-price cigar logging, a timestamp-derived live pouch timer, Toronto calendar-based spacing targets, real daily counts, chronological history with time editing/deletion, Undo, and Forest Green / Ocean Blue themes. Charts, calendar reports, XP, achievements, and spending analytics remain upcoming.

## Setup and new Firestore paths

Keep your existing `.env.local`. No new environment variables, Cloud Functions, billing upgrade, or package dependencies are required.

Deploy the new composite index and wait for its status to become enabled:

```powershell
firebase deploy --only firestore:indexes --project YOUR_PROJECT_ID
```

If you have not previously deployed the ownership rules, deploy both:

```powershell
firebase deploy --only firestore --project YOUR_PROJECT_ID
```

The existing `firestore.rules` needs **no changes**: it already restricts every document beneath `users/{uid}` to that authenticated UID. This phase adds the index declaration to `firebase.json`. Index deployment was not performed as part of local implementation.

| Path | Contents |
| --- | --- |
| `users/{uid}/entries/{entryId}` | `id`, `uid`, `kind`, `occurredAt`, `createdAt`, `updatedAt`, `costCents`, `currency` |
| `users/{uid}/settings/preferences` | `theme` (`forest` or `ocean`), `timeZone`, `currency`, `lastCigarPriceCents` |
| `users/{uid}/settings/schedule` | `timeZone` and `steps` array of `{week, startsOn, minimumMinutes}` |

Event time is a Firestore Timestamp captured at logging; creation/update times use server timestamps. The ID is allocated once before submission. Cigars store integer cents (190, 230, 250) and CAD on each entry; pouch/cigarette costs are null. Edits only update the event time and modification timestamp, preserving historical prices and creation time.

The profile-initialization transaction creates preferences and schedule **only when absent**, including for existing accounts. Existing profile/settings documents are not overwritten. Legacy Phase 1 `profile.settings` stays intact; new functionality reads the settings subcollection. Phase 1 created no usage records, so there is no record migration or sample-data seeding.

The centralized initial schedule is:

| Week | Toronto start date | Minimum interval |
| --- | --- | --- |
| 1 | 2026-10-23 | 60 minutes |
| 2 | 2026-10-30 | 90 minutes |
| 3 | 2026-11-06 | 120 minutes |
| 4 | 2026-11-13 | 180 minutes, continuing indefinitely |

The saved schedule is authoritative. You can later edit the Firestore schedule document; listeners pick it up automatically. Start dates are calendar strings, and evaluation uses the document's IANA timezone, not UTC date comparisons. Before the first date, the app shows the upcoming start without claiming an active week. There is no schedule editor UI yet.

## Synchronization and offline behaviour

Three real-time queries supply recent history (100 entries), today's records, and the latest pouch independently. The latest-pouch query does not depend on the history limit. Deleting/moving the latest pouch automatically exposes the next one. The daily query rolls over at local midnight and handles 23/25-hour DST days. Timer ticks calculate from `Date.now()` and the latest timestamp; they never write to Firestore. Background tabs recover accurate elapsed time on focus/visibility changes.

Firestore provides local write visibility and retrying with the same document ID. The synchronous 1.5-second submission guard prevents rapid duplicate taps. A toast offers Undo for eight seconds; a queued delete can undo a queued create. Pending saves are clearly distinguished from confirmed saves. Failed writes surface an error and Firebase rolls back the rejected local change.

**Offline scope:** the existing memory cache can queue writes while the tab stays open. Pending writes are not promised to survive a refresh, tab closure, sign-out, or browser termination. Keep the tab open until the saving notice clears. This phase does not enable durable offline storage. Cache-only query results are labelled as potentially incomplete. Initial profile/settings creation is a transaction and requires connectivity. The service worker still only caches application assets, never database responses or tokens.

Themes use shared CSS custom properties. Local storage caches the theme with its UID and applies it before CSS paint. After sign-in, the Firestore preference wins and real-time updates apply across devices. Unchanged selections do not write; failed saves roll back with an error. Sign-out clears the cache and resets Forest Green.

## Manual verification against your project

1. Deploy the index, run `npm run dev`, and sign in. Verify `settings/preferences` and `settings/schedule` appear beneath your UID. Reload and check the Google session remains active.
2. Tap Log Pouch once, then try a rapid double-tap. Check only one record per intentional action, the timer resets, and today's count changes. Use Undo and confirm the entry disappears.
3. Log a cigarette and verify its count increases while the pouch timer continues.
4. Log a cigar at each price. Reopen the panel to see the last price highlighted; inspect History to confirm each entry retains its own CAD price.
5. Refresh, edit the newest pouch's time to an earlier point in History, then delete the newest pouch. Verify the timer consistently uses the remaining newest pouch. Future edits are rejected. Dates are shown with Toronto's EDT/EST offset.
6. In Settings, select Ocean Blue. Check other pages, refresh, and open a second device signed into the same account. Change to Forest Green there and verify this device follows. Sign out and verify the default theme returns.
7. Verify writes/reads with another authenticated UID are denied by Firestore rules. Test a temporary network outage with a pending write, then reconnect while keeping the tab open.
8. For real iPhone Google redirect and standalone-PWA testing, use the HTTPS hosting setup in the main README; a localhost desktop test does not verify Safari redirect behaviour.

These actions create genuine records. Use test entries and remove them after verification.

## Automated verification

```powershell
npm test
npm run typecheck
npm run build
```

The suite includes 22 tests: date/schedule/timer unit tests and browser flows with a **test-only intercepted service layer**, not live Firebase. Browser coverage includes all logging types, prices, Undo including pending writes, duplicate-tap suppression, refresh/edit/delete timer behaviour, midnight counts, theme persistence and simulated remote updates, sign-out reset, loading/read/write failures, and both palettes at 320/375/390/1440px. Screenshots are generated in ignored `test-results/`. The tests never use your `.env.local` credentials to send database operations.

Final validation: **22 tests passed**; strict TypeScript passed, including the tests and their fixtures; production build passed using Node 24. No browser console/page errors were observed in the checked flows. Mobile/desktop theme screenshots and the 320px history editor were visually inspected.

Real Google OAuth persistence, deployed Firestore permissions/indexes, actual cross-device server synchronization, and physical iPhone installation have **not** been verified by these fixture tests. They remain the manual checks above. The production build retains a non-blocking bundle-size warning for the Firebase-containing application chunk. This is separate from TypeScript correctness.

## Files created

```text
docs/PHASE2.md
firestore.indexes.json
public/theme-init.js
src/config/defaults.ts
src/components/EntryEditor.tsx
src/components/PouchTimer.tsx
src/components/QuickLog.tsx
src/components/ThemeSwitcher.tsx
src/components/ui/Modal.tsx
src/components/ui/TrackingFeedback.tsx
src/contexts/EntriesContext.tsx
src/contexts/PreferencesContext.tsx
src/hooks/useClock.ts
src/hooks/useNicotineEntries.ts
src/hooks/usePouchTimer.ts
src/hooks/useSpacingGoal.ts
src/hooks/useTheme.ts
src/services/entries.ts
src/services/preferences.ts
src/utils/dataErrors.ts
src/utils/dateTime.ts
src/utils/themeCache.ts
src/utils/tracking.ts
tests/fixtures/browser.ts
tests/fixtures/tracking.ts
tests/tracking-flows.spec.ts
tests/tracking-utils.spec.ts
```

## Files modified

```text
README.md
firebase.json
index.html
tsconfig.json
vite.config.ts
src/App.tsx
src/components/layout/AppLayout.tsx
src/components/ui/StatCard.tsx
src/pages/Home.tsx
src/pages/History.tsx
src/pages/Settings.tsx
src/services/userData.ts
src/styles.css
src/types/data.ts
tests/foundation.spec.ts
```

No changes were made to `.env.local`, Firebase credentials, authentication providers, dependencies, or the existing ownership rules.
