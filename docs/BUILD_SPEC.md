# StudyFlow MVP v0.1 — Build Spec

## Product promise
StudyFlow is a personal anti-abandonment reader: it remembers where the reader stopped **and the thought they were carrying**, then makes resuming nearly frictionless.

## Locked MVP
1. Bookshelf with Continue-first layout.
2. PDF only.
3. Local-first PDF files via OPFS.
4. Offline structured data via Dexie/IndexedDB.
5. Supabase Auth + cloud sync of metadata/progress/notes/highlights/rewards/reminders.
6. Reader restores exact page + vertical position.
7. Four highlight colours: Apricot, Dusty Rose, Olive Cream, Dusty Blue.
8. Notes: Quick Note, Question, Parking Note.
9. Cassette progress represents coverage, not comprehension.
10. Explicit Finish Tape action unlocks exactly one B-Side Mystery Gift.
11. B-Side Vault keeps unlocked rewards even if a document is later removed.
12. Telegram reminder uses last meaningful activity and optional context.

## Out of scope v0.1
EPUB, OCR, AI, flashcards, social, realtime collaboration, CRDT, analytics dashboard, cloud PDF sync, elaborate game mechanics.

## Data authority
- PDF bytes: OPFS on each device.
- Read-time working state: Dexie first.
- Cloud-sync source for cross-device structured data: Supabase.
- Conflicts: latest `updated_at` wins for v0.1; preserve local queue until server acknowledgement.

## Reader locator
PDF locator: `{ "page": 47, "y": 0.63 }`.
Highlight rectangles are normalized to page dimensions (0..1) so they survive zoom/resizing.

## Meaningful activity
Updates `last_meaningful_activity_at` only on reading/navigation movement, note/highlight/question actions, or significant locator change. Opening and immediately closing the app does not reset reminders.

## Progress
Store coverage ranges, e.g. `[[1,12],[15,23],[30,31]]`. UI derives percent from range coverage / total pages. `completed` is explicit via Finish Tape, not automatic on reaching the final page.

## Reward contract
Reward is selected once when a document first transitions to completed. It is persisted in `unlocked_rewards`; refresh cannot reroll it. One-time collectibles never repeat; repeatable rewards use cooldown.

## Privacy
Telegram context can be disabled. Backups may contain notes/highlights and must state this clearly. PDF remains local by default.
