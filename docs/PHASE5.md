# Phase 5 — XP, levels, achievements and rewards

## Delivered

Phase 5 extends the existing application without changing the Phase 4 daily score formula or the Phase 3 money calculations. Home now has a compact Current Interval Rewards card immediately below the pouch timer, with awake time, interval XP, the next milestone/countdown, expandable completed milestones, and level progress. The XP placeholder is replaced with verified lifetime XP.

Rewards provides level progress, verified streak, achievement totals/recent achievement, a category gallery with All/Unlocked/Locked filters, supporting evidence, and the latest 30 stored rewards. Calendar daily/monthly reports include valid XP, milestone/achievement counts and reward interval statistics. The existing Forest Green and Ocean Blue themes, timer, individual cigar pricing, financial charts, history editor and confirmations are preserved. No Phase 6 functionality is included.

## XP policy

Configuration lives in `src/config/rewards.ts`. A pouch interval has the stable ID of its starting pouch entry and ends at the next pouch, or remains active through now. Cigarettes and cigars do not reset it. The target is the existing schedule target **in effect at interval start**; a week change during an interval does not move its goalposts. No schedule dates are duplicated in components.

| Awake-time milestone | Increment | Cumulative XP |
| --- | ---: | ---: |
| Target Reached: 100% | 10 | 10 |
| Extra Effort: 125% | 15 | 25 |
| Strong Discipline: 150% | 25 | 50 |
| Double Time: 200% | 50 | 100 |
| Triple Time: 300% | 100 | 200 |

Thresholds use milliseconds rather than rounded display minutes. A boundary is reached at equality. Each milestone has one deterministic ID, `spacing_{encodedStartingEntryId}_{milestoneId}`. The active interval can qualify without a new pouch, and a reopened app reconstructs milestone crossing times from the saved records. Beyond Triple Time, the timer and awake duration continue but that interval produces no additional ordinary milestones.

### Avoiding a reason to consume more

There is a **shared 200 XP allowance per Toronto date**, across all ordinary milestones and abstinence rewards. Milestones are allocated in crossing-time order, with valid evidence before provisional evidence. A cap can reduce the XP of a later milestone to zero; it remains an achieved milestone. Zero-XP milestones are still displayed with their actual stored award amount in Recent rewards. The Home milestone list shows the configured nominal increments and labels the cap.

A separate `abstinence_{YYYY-MM-DD}` award fills any remaining allowance on each explicitly confirmed, completed **pouch-free day**. It does not require a starting pouch or another logged use. Consecutive confirmed days are labeled Pouch-free day 1, 2, 3, etc.; unknown days break the evidentiary run. This allows long-term abstinence to keep receiving recognition without repeatedly resetting ordinary intervals. A confirmed zero-use day is sufficient evidence; an empty unconfirmed day is not. Provisional ordinary awards cannot consume the allowance needed by verified abstinence.

The daily cap and abstinence alternative are safeguards in addition to the requested per-interval milestone table. A day without pouches can earn the full allowance; using more cannot raise that allowance. This is a personal habit aid, not an optimization game or health assessment.

## Verification and offline states

* **Provisional:** a milestone has been reached in locally available records, but at least one Toronto date from interval start through milestone crossing is not a confirmed completed day. It can be saved as provisional, but does not increase lifetime XP or levels.
* **Valid/verified:** all dates supporting that milestone are completed and explicitly confirmed. Achievement definitions apply their own complete-period evidence requirements.
* **Pending synchronization:** Firestore cache/write metadata or an in-progress source review indicates that the server state is not settled. Saved totals are labeled as such; the UI never claims a local estimate was permanently saved.
* **Invalidated:** current facts no longer support the award. The record and its audit events remain, but its XP is excluded.

Confirmation is the existing `coverage/{date}` system shared by Calendar and Stats. No second confirmation system exists. Current-day rewards normally remain provisional until the day is over and tracking is confirmed. An ordinary multi-day interval cannot bridge an unconfirmed date and be treated as verified. Independent confirmed pouch-free days can still earn abstinence awards.

Offline UI can derive progress from the currently available SDK cache. Server reconciliation uses transactions and server reads and requires connectivity. Reconnect triggers a new review; no per-second Firestore writes occur. The existing Firebase SDK cache configuration is unchanged: this phase does **not** add durable offline storage or promise that an offline cold start contains all prior data. A tab need not remain open to earn eligibility; saved timestamps determine catch-up when records are available again.

## Sleep, DST and attribution

`src/utils/rewardTime.ts` reuses the Phase 4 sleep setting, default 23:00–09:00 America/Toronto. This is a **configured exclusion window**, not evidence of actual sleep. The Home timer continues showing full wall-clock elapsed time. Reward time sums only awake segments, including across midnight, and stops accumulating during the configured exclusion.

Each Toronto day is split at real-hour boundaries and at both possible occurrences of sleep boundaries. A nonexistent spring-forward boundary contributes no elapsed time; repeated fall-back time is counted or excluded according to its actual local sleep classification. Calculations use real timestamps, not naive subtraction of clock labels. Example: 22:30 to 09:30 with the default window contains only 60 reward-eligible minutes.

A spacing reward belongs to the Toronto date of its exact awake-time threshold crossing, regardless of when it is synchronized or confirmed. Abstinence belongs to the confirmed day, with an evidence time at its last millisecond. Achievements use the earliest qualifying evidence time. Every award is summed once by its stable ID; crossing midnight never duplicates XP.

Calendar interval counts deduplicate starting-entry IDs within the selected period. “Beyond target” uses verified interval duration greater than its start target; double/triple counts use the corresponding reached thresholds. Longest reward-eligible interval is the longest **stored rewarded** interval represented in that date/range, measured through the earlier of interval closure or the end of its award date. Intervals that never reached an ordinary milestone have no reward-ledger evidence and are covered by Phase 4's separate spacing report. Daily details also state whether the selected day qualifies toward the verified progress streak.

## Levels and celebrations

`levelProgress(xp)` derives level and progress from the valid ledger sum:

```text
threshold(L) = 100 * (L - 1)^2
level = floor(sqrt(validLifetimeXP / 100)) + 1
within = validLifetimeXP - threshold(level)
remaining = threshold(level + 1) - validLifetimeXP
percent = within / (threshold(level + 1) - threshold(level)) * 100
```

Level 1 starts at zero. There is no level-50 cap; tests include level 1,000. Invalid/non-safe numeric input is rejected as zero by the utility; supported totals stay within JavaScript's safe-integer range. Levels are **not persisted redundantly**. “Lifetime XP” means the current total of all valid awards, not a historical high-water mark that includes invalidated claims.

Milestone and level messages are small inline notices. They use theme tokens and respect `prefers-reduced-motion`; there is no audio or full-screen celebration. Per-user local presentation markers prevent notices from replaying on refresh. Existing awards on a fresh mount are silently loaded. Subsequent level increases announce the new level; corrections downward do not produce guilt-based messages.

## Achievement definitions

All achievements award **zero additional XP**: they recognize evidence without incentivizing extra uses. Stable definitions include ID, name, description, icon and category. Stored records include status, evidence and unlock time (`earnedAt`); first persistence time is separately retained.

| ID / name | Verified evidence |
| --- | --- |
| `first-step` / First Step | A valid Target Reached milestone |
| `extra-mile` / Extra Mile | A valid 125% milestone |
| `overachiever` / Overachiever | A valid 150% milestone |
| `double-time` / Double Time | A valid 200% milestone |
| `triple-time` / Triple Time | A valid 300% milestone |
| `getting-consistent` / Getting Consistent | Five consecutive eligible daytime intervals meeting their start targets; short or unconfirmed intervals break the sequence; sleep-excluded intervals do not manufacture successes |
| `solid-week` / Solid Week | Seven consecutive confirmed completed days with Phase 4 score >=75, or explicitly confirmed nicotine-free days |
| `steady-progress` / Steady Progress | Three consecutive fully confirmed Monday–Sunday weeks with strictly increasing actual eligible mean spacing; each week needs at least two eligible intervals |
| `less-is-more` / Less Is More | Positive reduction in average daily pouches over seven consecutive confirmed days, using one positive pouch baseline effective throughout |
| `halfway-there` / Halfway There | At least 50% reduction over that same meaningful seven-day baseline comparison |
| `personal-best` / Personal Best | Beat an earlier verified daytime interval record; a confirmed remaining awake segment can establish the new record without another pouch |
| `smoke-free-day` / Smoke-Free Day | One confirmed completed day with no cigarettes or cigars |
| `smoke-free-week` / Smoke-Free Week | Seven consecutive such confirmed days |

No baseline means no reduction achievement. Missing tracking never becomes abstinence. Different spacing targets are not substituted for actual durations in Steady Progress. The current progress streak is the number of consecutive qualifying confirmed days ending yesterday; a historical best run is not mislabeled as the current run. Some achievements have numeric progress (e.g. 3/5 intervals); others explain that verified evidence is needed rather than inventing a percentage.

## Persistence, concurrency and corrections

New optional paths under `users/{uid}`:

```text
rewards/{rewardId}
achievements/{achievementId}
  id, type, name, milestone
  earnedAt: epoch milliseconds
  date: Toronto YYYY-MM-DD
  xp: integer 0..200
  status: valid | provisional | invalidated
  evidence: { startDate, endDate, startEntryId, startMs,
              targetMinutes, awakeMinutes, intervalMinutes, detail }
  revision: positive integer
  firstRecordedAt, updatedAt: epoch milliseconds
  reason: correction / verification explanation

rewards/{rewardId}/history/{revision}
achievements/{achievementId}/history/{revision}
  version, sourceRevision, previousStatus, status,
  previousXp, xp, at, reason, evidence

settings/rewardState
  sourceRevision: integer
  processedRevision?: integer
  evaluatedRevision?: integer
  evaluatedAt?: epoch milliseconds
```

Entry create/edit/delete/restore, coverage confirmation/revocation, baseline append, sleep changes, and initial schedule creation increment `sourceRevision` in the **same atomic write** as their source change. Existing historical mutation transactions and their coverage revocations are retained.

Reconciliation reads the source revision, fetches source records from the server, then checks the revision again. A changed revision causes a retry instead of awarding from a mixed snapshot. That authoritative model is cached by user/revision/Toronto day. Observed source/configuration changes and explicit review invalidate the cache. The client derives desired records and diffs them against the saved ledger.

Each transaction rechecks the source revision and reads the actual target documents before writing. It writes at most **three award records plus their append-only audit events**, respecting rule access budgets, and advances an evaluation watermark. Existing equal awards are not rewritten. A newer evaluation's watermark prevents an older device clock from rolling back awards. A narrowly guarded retry handles the emulator/server contention case where rules see a competing committed award before a precondition conflict is reported: permission-denied is retried only if the server watermark proves a peer committed an equally recent evaluation of the same source revision. Other permission failures surface normally.

`processedRevision` advances only at completion of the chunked review. Partial reviews are labeled pending and are safe to repeat. Awards missing from the new desired set become invalidated; supported awards can become provisional if coverage is revoked. Every change retains prior status/XP and new supporting evidence in the next audit event. Reconfirming/restoring facts can reactivate the same IDs. No reward/achievement document is deleted, and historical audit records cannot be updated or deleted by the client.

An ordinary shorter interval after a legitimate milestone does not invalidate that earlier milestone. A factual correction that inserts a missing pouch before its crossing, changes the starting time, or removes supporting coverage can change valid XP and the derived level. Those are evidence corrections, not penalties for a difficult day.

## Reads and performance

The shared reward provider uses three subscriptions: rewards, achievements, and reward state. It reuses existing source data for local progress. Calendar retains its bounded Phase 4 entry queries; it does not start a full-history reward scan just to show a month. If calendar corrections make the reward ledger stale, its XP summary directs the user to Rewards for reconciliation rather than presenting stale XP as current.

Automatic server reconciliation runs on Home and Rewards when milestones/evidence change, not every second. The ordinary clock checks only the active interval; all-history grouping, completed interval calculation, performance days, and achievement comparisons are memoized by source data and Toronto day. Awake-window and prior-day-prefix caches avoid rescanning long active histories each tick. Only milestone changes recompute the complete desired ledger. There are no per-cell reward listeners.

A first authoritative review, changed source revision/configuration, a new Toronto day, or explicit review can require an all-history read. This is deliberate for arbitrary historical corrections and all-time achievements. The application still subscribes to the compact reward ledger rather than maintaining fragile XP counters. Large histories and audit trails increase Spark reads/writes; there is no claim of constant-cost unlimited-history reconciliation. No Cloud Functions, Blaze services, timers on a server, or paid infrastructure are required.

## Security and deployment

Deploy the updated `firestore.rules` before using persistence:

```powershell
firebase deploy --only firestore:rules
```

No new composite indexes are needed. Existing calendar indexes remain unchanged. No live deployment was performed during implementation.

Rules scope access to the signed-in UID, exclude reward paths from the generic write allowance, validate award/evidence shape and bounded nonnegative XP, enforce record revision progression, require corresponding audit events, and make audit history immutable. Reward state is validated and cannot be deleted. This is a **client-authoritative personal motivational system**, not a tamper-proof competition: an authenticated owner can control their own source records and client clock, and the rules cannot prove the mathematical truth of every interval. Direct console edits or older clients that do not bump the revision are outside the transactional source contract; use “Review reward evidence” after such changes and upgrade other clients. Observed configuration changes invalidate the local source cache, but a trusted server would be needed for adversarial score integrity.

## File inventory

Created:

* `src/config/rewards.ts` — milestone, allowance and achievement definitions.
* `src/types/rewards.ts` — source, ledger, evidence and feed types.
* `src/utils/rewardTime.ts` — Toronto awake segments, elapsed rewards and levels.
* `src/utils/rewards.ts` — pure evidence model, achievements, caps, reconciliation plan and summaries.
* `src/services/rewardRevision.ts` — shared atomic revision updates.
* `src/services/rewards.ts` — live ledger, authoritative reads, concurrent reconciliation and audit writes.
* `src/contexts/RewardsContext.tsx` — local derivation, synchronization, state and celebrations.
* `src/components/rewards/RewardCards.tsx` — Home XP, level, status and Calendar integrations.
* `tests/rewards-utils.spec.ts`, `tests/rewards-flows.spec.ts` — analytical and browser tests.
* `tests/rewards-emulator.mjs` — production services bundled against two isolated emulator clients.
* `docs/PHASE5.md` — this guide.

Modified:

* `src/pages/Rewards.tsx`, `src/pages/Home.tsx` — dashboards and real XP.
* `src/components/layout/AppLayout.tsx` — authenticated reward provider.
* `src/components/performance/Reports.tsx` — daily/monthly rewards and streak evidence.
* `src/services/entries.ts`, `src/services/finance.ts`, `src/services/performance.ts`, `src/services/userData.ts` — atomic source revisions and correct typed reward references.
* `src/styles.css` — theme-aware cards, compact levels, gallery and reduced motion.
* `firestore.rules` — new schema validation, ownership and audit constraints.
* `tests/fixtures/browser.ts`, `tests/fixtures/tracking.ts` — isolated reward services, offline and source-change fixtures.
* `tests/firestore-rules.mjs` — invokes production-service reward emulator tests.
* `tests/performance-flows.spec.ts` — waits for responsive layout to settle before asserting width.
* `README.md` — current phase overview and guide link.

## Tests and manual checks

```powershell
npm test
npm run typecheck
npm run build
npm run test:rules
```

Use Node 24.12+; the Firestore emulator also needs Java 21. This machine uses `npx --yes --package=node@24 -c "npm run build"` and a portable Java 21 installation for emulator tests. The emulator test guard requires `127.0.0.1:8180` and project `demo-pouchtracker`. Browser tests intercept Firebase services, and the production-service emulator harness substitutes only the Firebase configuration module. It never reads the live `.env.local` configuration.

Validation: **82 unit/browser tests**, **45 Firestore emulator checks**, strict TypeScript, and the production/PWA build pass. The suite includes all prior tracking/pricing/finance/calendar tests. New coverage includes all five exact milestone boundaries, cumulative XP, week targets, DST, sleep, caps, confirmed abstinence, unconfirmed gaps, refresh idempotency, two real emulator clients awarding concurrently, edits/deletion/Undo, invalidation/restoration, stale device clocks, levels beyond 50, achievement evidence/uniqueness, streaks, calendar attribution, offline provisional states, one-time level celebrations, both themes and reduced motion. Browser layouts were checked at 320/375/390/1440px. The existing non-blocking Vite initial chunk-size warning remains.

For manual verification:

1. Use a test account and review the existing schedule/sleep settings. A 60-minute target should show cumulative 10/25/50/100/200 XP at 60/75/90/120/180 **awake** minutes. Waiting is sufficient; do not log another pouch to claim progress. Use historical test timestamps or the isolated automated test clock rather than consuming nicotine to test.
2. Keep an interval active overnight. Full elapsed time must continue on the Home timer while reward time pauses during the configured exclusion window. Check spring/fall DST dates if testing historical evidence.
3. Verify current-day milestones are provisional. After the day ends, confirm complete tracking in Calendar/Stats, then open Home/Rewards. The same IDs should become valid and the level should update once.
4. Confirm a genuinely pouch-free past day. It should fill the daily 200 XP allowance without creating a pouch record. An unconfirmed empty day must award nothing. Confirm several consecutive days to inspect abstinence and smoking-free evidence.
5. For level testing, use valid test-ledger totals 99/100, 399/400 and 899/900; at 950 XP the progress is 50/700 within level 4, with 650 remaining to level 5. The level test suite covers these formulas without modifying production data.
6. Edit a historical start timestamp or add a missing test pouch via the existing log/time editor. Review affected confirmations. Unsupported milestones must become invalidated/provisional, valid XP must recalculate, and ledger audit revisions must remain. Undo/reconfirm and verify restoration uses the same IDs.
7. Refresh and open a second signed-in test device. Verify no duplicate IDs/XP and no repeated refresh celebration. Concurrent emulator clients are automated; live cross-device testing is still manual.
8. Disable network connectivity. Check provisional/local labels and absence of claims that a new reward is permanently saved. Reconnect and review. Offline cold starts and mobile OS background suspension need physical-device verification.
9. Test both themes, 320px portrait, gallery filters, expandable evidence, keyboard controls and reduced-motion OS settings. The timer remains prominent and reward details can be expanded when wanted.

## Remaining limits

Rewards depend on honest complete-tracking confirmation and the client clock. Ordinary XP is capped and requires confirmation; users should not expect current-day provisional points to raise their verified level immediately. The current sleep window/configuration recalculates past eligibility, as in Phase 4; it is not versioned sleep sensing. Historical mutation and authoritative reward reconciliation require connectivity. Calendar shows a review prompt after corrections until Home/Rewards reconciles, preserving month-scoped reads. All-time reconciliation and immutable audit history grow with use. The initial page bundle still triggers Vite's size warning. Live Firebase, production deployment, real cross-device synchronization, physical iPhone background behavior, and durable offline cold starts were **not** tested or claimed.
