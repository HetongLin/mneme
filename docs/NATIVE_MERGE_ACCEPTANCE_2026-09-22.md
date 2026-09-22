# Native Merge acceptance — 2026-09-22 to 2026-09-23

Environment: macOS, Obsidian 1.13.7, disposable Vault `Mneme_Release_Candidate`.
Scope: Guided Merge content retention, native same-name relationship resolution,
completion details, and plugin reload. This is not full restart/platform acceptance.

## Isolation and baseline

- Production code at entry: `3d3affc`; handoff checkpoint: `c192e8f`.
- Branch: `test/native-merge-acceptance`.
- Current personal Vault was identified before switching to the registered test Vault.
- Existing test plugin files and data were backed up to
  `release-artifacts/refactor-acceptance-20260922/plugin-before`.
- Existing Markdown hashes, initial fixtures, build hash and content verification
  results are retained alongside that backup. No credentials were copied into fixtures.
- Initial tested main.js SHA-256:
  `05c67f4852835b008dc63eef9f042be56997d528a04d920c826128623aa06840`.
- New fixtures are under `Refactor Acceptance 20260922/` in the test Vault.
  Existing recorded-acceptance Vault, recordings and personal Vault content were not changed.

## Native UI and file evidence

1. Reloaded the current plugin in the test Vault using Obsidian's developer CLI.
2. Native `metadataCache.getFirstLinkpathDest` resolves Reader's bare `Topic` to
   `Refactor Acceptance 20260922/Readers/Topic.md` (ordinary note), while Neighbor's
   bare `Topic` resolves to `Refactor Acceptance 20260922/Concepts/Topic.md` (Concept).
3. Selected R30 Alpha and R30 Topic through Guided Merge in a real popout window,
   generated a Manual Draft, opened the confirmation and cancelled it. All five
   fixture files remained byte-for-byte unchanged.
4. Reopened confirmation: the summary reported one Related link updated and
   explicitly described preserving the redirect's original content. Confirm Merge
   completed successfully through the native UI.
5. Disk assertions verified original YAML/body retention at the source path, correct
   type/retired ID, canonical Neighbor rewiring, and unchanged ordinary Reader/Topic.
   Existing Markdown hashes and pre-existing proposals, conflict drafts, review
   states/events matched the backup. The new Merge Record was persisted.
6. Opened the source's old path in Obsidian: Properties displayed aliases, custom
   owner, nested value, multiline property and retired identity. Reading mode showed
   the leading notice and original authored sections. Clicking the notice opened
   Alpha, whose Views and Related section rendered the copied content and Neighbor.
7. Refreshed Concept Library showed Alpha, Neighbor and Reader, excluding retired
   Topic. Opening Alpha from the Library displayed Related Concepts (1).

## Defect found during acceptance

Immediately after step 4, **View Merged Concept** incorrectly displayed Related
Concepts (0), despite the correctly written relationship. This remained distinct
from the Library's correct count. Code tracing confirmed that the completion
callback rescans, but `openConceptDetail` passed the old survivor object alongside
the new list to the modal. The modal reads relationship IDs from that old object.

Fix commit: `49f53d1`. The shared `openConceptDetail` entry now selects the matching ID and exact path
from the supplied scan result, and passes that current object to the modal and
its actions. If the identity/path is absent, it asks for a refresh and does not
open an obsolete Concept. It does not add another scan or promise live updates.

The actual plugin method has a regression test with a stale summary and a current
scan list, plus deleted/moved/changed-ID cases. The pre-fix test failed with stale
relationship/title/Card Group data. Focused and full suites passed after repair;
independent review found no blocking issue.

Post-fix native UI verification added R30 Followup and its neighbor, then merged
Followup into Alpha. **View Merged Concept** immediately showed Related Concepts
(2), listing both Neighbor and Followup Neighbor. On 2026-09-23, after another
plugin reload, Concept Library showed five active Concepts: the original release
fixture plus Alpha, Reader and both neighbors. Neither retired source appeared.
Alpha details still displayed both relationships. Final file/state assertions
confirmed the old fixtures and pre-existing proposal/draft/review data were intact,
both Merge Records survived, and the installed plugin matched the built artifact.

Final main.js SHA-256:
`721de42384e62e392c8a71d4a1b4bb0de3b0213ad1c397f36fe48b9d016ee402`.

Validation: `npm run test:all`, `npm run build`,
`npm run check:release -- 1.0.0`, and `git diff --check` passed.
Logs: `/private/tmp/mneme-native-detail-red.log`,
`/private/tmp/mneme-native-detail-focused.log`,
`/private/tmp/mneme-native-detail-all.log`, and
`/private/tmp/mneme-native-detail-build.log`.

The updated plugin and test fixtures remain in the disposable acceptance Vault;
its previous plugin/data backup is retained. They were not deployed to personal
Vaults or included in a published release.

## Remaining boundaries

This fixture has no Cards and makes no AI request. It does not establish FSRS,
Card migration, real provider quality, restart recovery, Windows/mobile behavior,
all popout transitions, or external-writer isolation. Incoming/Guided Merge durable
recovery remains outstanding. A successful plugin reload is not a process restart.
