# Native Review Owner Grouping — 2026-09-28

Round 39 starts at `3a5d96b` on `test/native-review-owner-grouping`.
This round verifies the preceding ownership fix in macOS Obsidian 1.13.7.
No additional product-code change was needed.

## Setup and baseline

The isolated Vault is `release-artifacts/Mneme_Release_Candidate`. Before testing,
the installed plugin/data were copied and all 55 existing Markdown files hashed
under `release-artifacts/native-owner-grouping-20260928/` (local, untracked).
No personal Vault was modified.

Four new files share `Owner Group Native Acceptance 20260928/`:

| Concept | ID | Card IDs | Learning mode | Retention target |
| --- | --- | --- | --- | --- |
| Alpha | `r39-alpha` | `r39-alpha-card` | exploratory | 0.80 |
| Beta | `r39-beta` | `r39-beta-one`, `r39-beta-two` | reviewable | 0.95 |

Each Concept declares its own Card Group. Both groups link explicitly back to
their owners and include custom YAML and prose outside the Card blocks.
`fixtures.json` records their exact initial contents.

The still-installed old bundle was tested first. With native file enumeration,
Library counted Alpha **0**, Beta **3**, and Review put all Cards under Beta with
retention 0.95. Temporarily reversing the read-only `getMarkdownFiles()` result
changed Library to Alpha **3**, Beta **0**; all Cards inherited Alpha's exploratory
policy and none was eligible for the scheduled queue. The zero-count tile showed
Generate to Review despite its existing Cards. That button was not invoked.
`old-normal.json` and `old-reversed.json` capture this actual native regression.

## Fixed build and UI checks

The current build was installed only in the isolated Vault and reloaded:

- Old SHA-256: `6aa7777393d8735456612a9c2ba8de72dcc0a9ed5dcd09ad263daa35380c0da4`.
- Fixed SHA-256: `9287050608063d76bbdf9eb7f65dd605d6dc0aae96bd50940d841572270563c1`.

Both enumeration orders now yield Alpha **1** and Beta **2** in Library's count
model. Both tiles show Review Cards. Review holds exactly the corresponding Card
IDs, Concept paths, and Card Group paths; retention targets remain 0.80 and 0.95.
Alpha has zero scheduled-review-eligible Cards; Beta has two new eligible Cards.

Actual Library Review Cards → Show Answer → Back controls were exercised. Alpha
opens one Card and Beta opens two. Native accessibility interaction with More ▾ →
Skip for Now advanced Beta to its second Card, whose Front and Back were checked.
The same native interactions were repeated with reversed file enumeration.
Alpha remains manually reviewable from Library despite being excluded from the
scheduled queue; this is the existing manual Concept Review behavior.

Normal-order entry used CLI-driven renderer DOM controls. The reversed-order
entry and native menu checks used the computer-use accessibility interface.
Count/queue/session evidence was captured through read-only native diagnostics.
This is not a comprehensive screenshot, keyboard-accessibility, or visual QA run.
No rating, AI generation, Card edit, or deletion was submitted. Retention was
verified on the loaded Concept/session, not by a new persisted FSRS transition.

## Harness corrections

The first script waited for `activeLeaf` to become Library after returning from
the popout Review window. The session had exited, but that focus-based wait did
not complete as expected. The corrected harness awaited the real UI action's
completion instead. Later menu probing initially used “More” instead of “More ▾”
and searched DOM menu items, but this menu is native macOS UI. Native accessibility
controls completed that check. Stale accessibility element references were
refreshed before retrying. These preparation failures are not product failures
or passed checks. The failed DOM menu attempt is retained separately as
`ui-check-dom-menu-attempt.js`; `ui-check.js` covers the working first-Card entry.

## Preservation and validation

The temporary file-order wrapper was restored and the plugin reloaded again.
`after-reload.json` confirms separate owners and no scan wrapper remaining.
`verify-final.py` and `final-results.json` confirm:

- All 55 original Markdown hashes unchanged; exactly four new files.
- All four fixtures remain byte-identical, including custom YAML and prose.
- Entire plugin data.json remains byte-identical: settings, histories, state,
  authoring data, and repair records are unchanged; no new ratings.
- Installed bundle equals the repository build.
- Old behavior depends on file order; fixed behavior passes both orders and reload.

`npm run test:concept-library`, `npm run build`, and
`npm run check:release -- 1.0.0` passed, as did the documentation diff check.
Logs: `/private/tmp/mneme-native-owner-{focused,build,release}.log`.
The previous full-suite result belongs to the code-change round; this round did
not rerun unrelated suites. No push or full application process restart occurred.

Next review targets are duplicate queue IDs across folders, conflicting stable
owner IDs versus Concept links, and metadata-cache timing. Earlier deletion/repair
interruption points, duplicate-ID native recovery, interrupted new-group creation
and rating persistence, and other platforms remain separate acceptance work.
