# GSMBot Backlog

## Carried from v1.0 — 2026-09-15

The user chose milestone completion after reviewing the tech-debt audit. Items below remain open unless explicitly described as accepted behavior or resolved history. Waivers must not be reopened automatically.


1. **Phase 1: N-6.** Text-input setup steps append cards; owner deferred this residual. The 20+ account pagination waiver remains an accepted evidence limit, not a new required test.
2. **Phase 3: validation record.** Reconcile the draft as above.
3. **Phase 3: window 21.** WINDOWS.md still has one open item: the stricter preflight set-equality rewrite lacks a test that distinguishes the old implementation. Existing PostgreSQL boundary tests do not prove the unreachable duplicate-expected-object shape. Resolve with a meaningful pure-helper test or explicit disposition; do not count unrelated later migration tests as closure. If windows_enforce is enabled at ship time, the open ledger item can block that workflow.
4. **Phase 3: observability.** Current claimAnnouncementRepost catches without binding/logging and returns false (planning-service.ts:2823). dispatchAnnouncement treats failed pointer persistence like stale state and records a bounded outcome without its original exception (planning-handlers.ts:2607 onward). These retain verification WR-03 and WR-01; they impede diagnosis but no required business transition is demonstrated broken.
5. **Phase 3: capability API.** mintBookingRequestAction remains public while ensureBookingRequestAction is private (planning-service.ts:1502/1551). Existing callers use the guarded path; visibility remains verification WR-06 maintenance debt.
6. **Phase 4: validation/provenance.** Reconcile partial metadata without inventing historical probe output.
7. **Phase 3→4: WR-04.** Status can recover an older booked round without an endsAt cutoff. Phase 4 expressly retained this and H6 accepted the dated presentation; automatic completed-state filtering is not implemented. No exhausted-Sunday hour-level rollover is claimed either: today remains selectable under the accepted contract.
8. **Phase 5: phone follow-up.** Observe notification visibility/sound and card navigation at first real use under normal client settings, as 05-ACCEPTANCE.md requests. Do not schedule a new UAT or reopen waived native variants.
9. **Phase 5: dependencies.** The recorded security assessment retains five high Prisma-tooling findings and reports no application exploit preconditions in the inspected configuration. No new registry/security scan was performed by this audit; maintenance remains due.
10. **Phase 5: shutdown.** Runtime retains Prisma while already-executing middleware settles after its drain deadline; total exit time is not strictly bounded. Unknown reminder delivery is deliberately terminal and a possible missed occurrence is accepted to prevent duplicate sends.
11. **Milestone documentation.** PROJECT.md still lists delivered behavior as Active and several decisions as Pending; ROADMAP retains historical not-complete wording for 01-14; verification bodies retain historical human_needed claims. Reconcile at archival without deleting acceptance provenance.
12. **Verification scope.** Current working-tree changes are not covered by a newly run full immutable-tree suite. Recorded Phase 5 evidence includes 381 unit and 448 integration baseline tests plus 25 final affected tests, with the baseline overlapping review fixes; do not describe that as a full final-HEAD regression.

Historical warning WR-02 (booked owner attribution) has a passing Phase 3 UAT check and current result carries owner. The separate migration-restart defect is resolved in .planning/debug/migration-restart.md: 34/34 preflight tests, build/image evidence, and successful ordinary Compose startup are recorded. Neither is reopened here. Historical review IDs with the same spelling can refer to different findings; the unresolved warnings above refer specifically to the Phase 3 VERIFICATION report.


## Carried from v1.1 — 2026-09-20

13. **GSD tooling: waiver handling in the `uat-passed` predicate.** `.claude/gsd-core/bin/lib/uat-predicate.cjs` (mirrored in `.codex/`) defines `PASSING_RESULTS` as `{passed, pass}`, so any `result: skipped` becomes a blocker. The same runtime's `workflows/verify-work.md` completion contract classifies skipped-with-reason as a definitive resolution and sets `status: complete`. The two disagree, so a phase holding a legitimate, user-approved waiver cannot clear verify-work's pre-transition check even though the authoritative gate (`query phase.complete`: canonical verification passed plus full plan coverage) is satisfied. Encountered closing Phase 8; resolved there by completing through the authoritative gate without altering evidence. Fix belongs upstream in gsd-core — the files are build-at-publish compiled output (ADR-457) and a local edit would be overwritten on update. Until fixed, expect the same friction on any future phase carrying a waiver.

## Next milestone candidates

- Reconcile archived Phase 3/4 Nyquist records and disposition window 21.
- Address announcement observability and capability API maintenance.
- Observe phone notification behavior at first real use under normal client settings.
- Evaluate automatic booking (BOOK-01–05) only when selected for a future milestone; it is not committed scope.

Phase commands may need archived-phase resolution; evidence lives under milestones/v1.0-phases/. Quick-task history remains in .planning/quick/ and is not rebucketed.
