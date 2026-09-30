# Native Fresh Card Discovery and Rating Guards — 2026-09-29

Round 43 starts at `9813d91` on `test/native-fresh-card-discovery`.
Acceptance ran September 29–30 in macOS Obsidian 1.13.7 (installer 1.12.7),
covering the ownership, rating snapshot, and discovery changes from rounds 40–42.
No additional product-code change was needed.

## Setup and old baseline

Only the isolated Vault `release-artifacts/Mneme_Release_Candidate` was used.
The installed plugin/data were backed up and all 59 existing Markdown files
hashed in `release-artifacts/native-fresh-discovery-20260929/` (local, untracked).
Six files were added under `Fresh Discovery Native Acceptance 20260929/`:

| Owner | Card files and IDs | Learning mode | Retention |
| --- | --- | --- | --- |
| `r43-alpha` / Alpha.md | One/Prompts.md: `r43-alpha-one`; Two/Prompts.md: `r43-alpha-two` | reviewable | 0.87 |
| `r43-beta` / Beta.md | Beta/Prompts.md: `r43-beta-one` | exploratory | 0.94 |

The sixth file, Extra/Prompts.md, starts and finishes as an ordinary note.
Card files include custom YAML and prose outside Card blocks; Beta's group uses
BOM, CRLF, and a quoted YAML type value. `fixtures.json` stores exact contents.

The old installed round-38 bundle split Alpha into two separate loader entries,
each with one Card. Library counted Alpha 1 rather than 2. Temporarily returning
undefined from `metadataCache.getFileCache` for One/Prompts.md also hid
`r43-alpha-one` entirely. `old-baseline.json` records both native results.
No rating was submitted on the old build.

## Fixed discovery and Library behavior

The repository build was installed in the isolated Vault and the plugin reloaded:

- Old SHA-256: `9287050608063d76bbdf9eb7f65dd605d6dc0aae96bd50940d841572270563c1`.
- Fixed SHA-256: `a6f5f90cccb97f1b3345a43d18f5b9fa3b754b65e62094d23fa15f793fae0714`.

The fixed loader returns one Alpha entry with both Cards and one Beta entry with
its own Card. Paths, learning modes, and retention targets remain correct.
Returning no metadata cache for every fixture path gives the same result.
A fake positive Card-type cache entry for the ordinary Extra note does not
create a phantom Card owner (`fixed-scan.json`, `stale-positive.json`).

Native Library → Review Cards → Show Answer interactions verify the actual
Front/Back content. Alpha has two Cards. Beta remains manually reviewable with
exploratory mode and retention 0.94, but has zero scheduled-queue Cards.
Changing only Beta/Prompts.md's current `mneme_type` to `note` removes its Card
from Library: Beta becomes 0 and offers Generate to Review. Generation was not
invoked. Restoring its bytes and refreshing returns Beta to 1; Alpha stays at 2.
Evidence: `alpha-second.json`, `beta-manual.json`, `beta-type-removed.json`, and
`beta-type-restored.json`.

## Rating guards and recovery

With Alpha's first answer already shown, each of these fixture changes was
followed by an actual native Good click:

| Change after opening Review | Evidence | Handler elapsed time |
| --- | --- | --- |
| Card owner becomes Beta while its Concept link remains Alpha | blocked-owner.json | 26.5 ms |
| Current Card Back changes | blocked-content.json | 22.1 ms |
| Alpha retention changes from 0.87 to 0.81 | blocked-retention.json | 13.5 ms |
| Extra becomes an uncached Card file with a duplicate Card ID | blocked-uncached-duplicate.json | 22.9 ms |
| Extra becomes an uncached same-owner Card file linking to Beta | blocked-uncached-paths.json | 21.9 ms |

All five attempts displayed “Could not record review”, kept the current index
at 0 with the answer visible, called `recordReview` zero times, and left the
entire data.json byte-identical to its pre-attempt value. The path conflict also
disabled Alpha's Library action as Review unavailable, with a diagnostic naming
the conflicting paths; Beta remained reviewable (`library-conflict.json`).

After restoring fixtures and refreshing/reopening Alpha, one native Good click
called `recordReview` exactly once and advanced to `r43-alpha-two`. It persisted
one FSRS state (`reviewCount: 1`, last rating Good) and one event for
`r43-alpha-one`; no existing Card was rated. `recovered-rating.json` and
`successful-state.json` capture this transition. The second Card's answer was
then checked without another rating.

All UI actions used native accessibility controls. Obsidian CLI diagnostics
read real loader/session/data results, modified only the new fixtures, and
temporarily instrumented real methods. The cache-miss cases deliberately
override cache lookups; they do not demonstrate a naturally occurring cache
race. Wrappers observe the real scan/store behavior rather than substituting
validation outcomes, and are restored after each case.

## Timing, preservation, and validation

Five complete loader scans over 65 Markdown files took 22.3, 16.5, 12.2, 10.5,
and 9.7 ms. The successful rating handler took 14.1 ms, including an 11.6 ms
scan. These are warm, small local-Vault observations, not large-Vault or cold-I/O
benchmarks; handler timing does not measure screen-paint latency.

Testing paused on September 29 when a tool quota prevented the next command
from executing, then resumed September 30. Beta's manual/type-change checks
were completed after reopening the isolated Vault. A stale accessibility
reference was refreshed during testing. These harness interruptions are not
product failures or crash-recovery acceptance.

After a final plugin reload, Alpha still has 2 Cards and Beta 1, the single new
state/event remains, and runtime instrumentation is absent (`after-reload.json`).
The temporary global helper was also removed. `verify-final.py` and
`final-results.json` verify:

- All 59 pre-existing Markdown files remain byte-identical; exactly six files
  were added, and all six match the original fixture bytes, including BOM/CRLF.
- Existing review states/events and every other data.json field are unchanged.
  Only the one deliberate Alpha state and event were added.
- The five blocked ratings, restored rating, Library conflict, type removal and
  restoration, manual exploratory session, and reload checks pass.
- The installed main.js hash equals the repository build.

`npm run build`, `npm run check:release`, `npm run test:review-navigation`, and
`npm run test:concept-library` passed. Logs are
`/private/tmp/mneme-native-discovery-{build,release,rating,focused}.log`.
Documentation diff checks passed. Full-suite results belong to the preceding
code-change rounds; this documentation-only round did not rerun unrelated suites.
No push, personal-Vault edit, or controlled full application restart occurred.

## Remaining boundaries

Next review target: the interval between the rating snapshot scan and the actual
Store mutation, especially waiting for its mutation queue. This run does not
protect or test edits occurring after the scan. Unknown malformed/unreadable
files can still hide identities; this acceptance makes no completeness claim
for those files. Large-Vault timing, earlier deletion/repair interruption points,
interrupted new-group first writes and rating persistence, and other platforms
remain separate work. This round does not establish release-wide completion.
