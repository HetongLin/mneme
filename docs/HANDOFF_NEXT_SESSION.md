# Mneme Next-Session Hand-off

Updated: 2026-07-23

## Start Here

Repository:

```text
/Users/linus/Projects/mneme-workspace/app/mneme
```

The user communicates primarily in Chinese. Fixed product UI labels remain English.

Before changing code, read:

1. `AGENTS.md`
2. `docs/CODEX_BRIEF.md`
3. `CONTEXT.md`
4. Relevant ADRs under `docs/adr/`
5. `docs/PRODUCT_SPEC.md`
6. `docs/ROADMAP.md`
7. `docs/V1_RELEASE_CHECKLIST.md`

ADRs are authoritative when documents conflict.

## Critical Workspace Warning

The current branch is:

```text
codex/task-054-stale-source-remove
```

The branch name does not describe the current product scope. The working tree contains a large body of intentional, uncommitted implementation and documentation work accumulated through product testing. It includes modified and untracked files.

Do not:

- reset, checkout, clean, discard, or broadly overwrite the working tree;
- assume the last Git commit contains the current product;
- delete the long-standing untracked `mneme` self-link;
- delete `release-artifacts/` without inspecting it;
- refactor unrelated areas while beginning the next version.

Inspect `git status` and the actual files first. Preserve all existing user changes. Committing, tagging, pushing, or publishing requires explicit user authorization and intentional scope review.

## Current Verified State

Mneme metadata is at `1.0.0`. The v1.0 feature set is functionally complete, although the final cross-platform publication checklist is not complete.

Verified again on 2026-07-23 from the current working tree:

```text
npm run test:all  # passed
npm run build     # passed
```

The current implementation includes:

- Source Note analysis with chunked, grounded AI Concept extraction;
- editable Inbox Review Gate for all AI knowledge changes;
- direct manual Concept creation without a fake approval step;
- direct manual Card creation for an approved Concept;
- clean Concept Markdown and one canonical Card Group Markdown file per Concept;
- independent immutable Card IDs and Card-level FSRS state;
- fixed Concept-generation prompt and selectable built-in AI Card types;
- Concept Library, Concept View, editing, deletion, search, tags, and Related Concepts;
- exact-name conflict handling through Merge, Refine Name, or Keep Both;
- Possible Duplicate detection and two-Concept Guided Merge;
- Anki-style review layout with fixed action bar and Card-level controls;
- optional Scheduled Review and Concept-grouped Today’s Focus;
- one-way Anki TSV export and neutral Knowledge Context Pack export;
- Concept deletion with explicit confirmation and preservation of anonymous historical review records.

## Non-negotiable Product Contracts

### Knowledge approval

- AI proposes; the student reviews, edits, accepts, or rejects.
- AI must not write final Concept or Card Markdown directly.
- Direct student authorship writes immediately and does not pass through Inbox.

### Content and state ownership

- Concept is the primary learning object.
- Card is an assessment instrument for one Concept.
- Concept Markdown is the source of truth for Concept content.
- One Card Group Markdown file per Concept is the source of truth for Card content.
- `data.json` stores indexes, proposals, fingerprints, FSRS state, events, logs, and caches—not Card front/back content.

### Identity

- Durable state is keyed by immutable Concept and Card IDs, never file paths.
- Concept Title is primary-language and editable.
- English Name is stored separately; for English Concepts it normally matches Title.
- New Concept IDs are readable ASCII IDs derived from English Name at first write and then remain immutable.
- New Card IDs are deterministically derived from written Concept ID plus Card Type, with numeric suffixes for repeated types.
- AI never chooses final IDs.

### Review and FSRS

- FSRS fully owns Card scheduling.
- Concept is only an aggregate learning state.
- Only an explicit normal Card review and user-confirmed Again/Hard/Good/Easy rating updates FSRS.
- Exam Attempts, Use activity, Concept ranking, AI suggestions, and Concept organization must not mutate FSRS.
- Manual `Review Cards` from Concept Library does update FSRS because it is a real Card review.
- No daily Concept/Card caps may hide FSRS-eligible Cards.
- Concept-level `Pause Concept` is not part of the active product UI; controls operate on Cards.

### Merge and links

- AI extraction is context-free and does not receive the existing Concept library merely to prevent duplicates.
- Duplicate Concepts may enter Inbox; reconciliation is an explicit later action.
- Guided Merge is user-triggered, previewed, transactional, and rollback-safe.
- AI may help draft only learning prose; deterministic code handles metadata, Cards, IDs, Related links, Redirect Notes, state migration, and conflicts.
- Merged Cards retain their immutable IDs and FSRS histories.
- The MVP has one symmetric Related relationship. Adding/removing it updates both Concept files.

### Language and tags

- Fixed UI and structural labels are English.
- Generated learning prose follows the Source Note’s dominant language.
- Non-English Concept titles carry a canonical English Name.
- Tags are English lowercase slugs.
- AI should prefer a few broad stable tags and avoid generic or near-duplicate tag explosion.

## Remaining v1.0 Publication Work

The feature set is complete, but publication readiness still requires:

- completing the disposable macOS `PRE_AI_ACCEPTANCE_CHECKLIST`;
- full plugin reload and Obsidian restart regression;
- Windows real-vault validation;
- clean installation using only `main.js`, `styles.css`, and `manifest.json`.

These are release gates, not missing v1.0 product functions.

## Recommended Next Major Direction

The recommended next major feature is **Course Context**, before a standalone Random Concept Draw.

This is a recommendation from the previous conversation, not yet an implemented or formally approved roadmap rewrite. Confirm it with the user before coding.

Why Course Context comes first:

- Mneme targets university students, but approved Concepts are currently vault-global without a course boundary.
- Course Context is shared infrastructure for Exam Mode, course-filtered Knowledge Context Packs, and future Use Mode.
- Random Concept Draw is more coherent as an Exam/Course capability than as a separate duplicate surface.
- AI Answer Grading should follow a stable non-AI Exam Session workflow.

### Proposed next version: Course Context MVP

Keep the first increment bounded:

1. Create, rename, and delete a Course.
2. Add/remove existing approved Concepts through search and selection.
3. Store Course membership by immutable Concept ID; never copy Concept files.
4. Show a Course Concept pool with simple counts and missing-Card state.
5. Open a Concept or enter its normal Card review.
6. Export a Knowledge Context Pack filtered by Course.
7. Keep Course membership and Course browsing completely separate from FSRS state.

Do not add in the first increment:

- AI course assignment;
- schedules, calendars, or exam dates;
- AI answer grading;
- automatic project recommendation;
- complex learning analytics;
- new FSRS behavior.

### Natural follow-up

After Course Context is stable:

```text
Course
→ Exam Session
→ Random or Needs Work Concept draw
→ Student recall/explanation
→ Reveal Concept
→ Record Exam Attempt / Needs Work Signal
→ Optionally enter normal Card review
```

Exam Attempts and Needs Work Signals remain Concept-level evidence and do not update FSRS.

## Recommended First Actions in the New Session

1. Inspect `git status` and the current diff without modifying it.
2. Re-read the authoritative Course, Concept Set, Exam Attempt, FSRS, and Use Mode definitions.
3. Confirm with the user that Course Context should replace standalone Random Concept Draw as the next roadmap increment.
4. Before implementation, document the Course data model and lifecycle in an ADR.
5. Produce a small, testable implementation plan.
6. Implement the smallest vertical slice without changing existing Concept/Card/FSRS formats.
7. Run `npm run test:all` and `npm run build`.

## Paste-ready Prompt for the New Conversation

```text
继续 Mneme Obsidian 插件项目。

项目目录：
/Users/linus/Projects/mneme-workspace/app/mneme

请先完整阅读：
- AGENTS.md
- docs/HANDOFF_NEXT_SESSION.md
- docs/CODEX_BRIEF.md
- CONTEXT.md
- 相关 ADR
- docs/PRODUCT_SPEC.md
- docs/ROADMAP.md
- docs/V1_RELEASE_CHECKLIST.md

注意：当前工作树有大量尚未提交但属于项目成果的修改。不得 reset、checkout、clean、覆盖或删除任何现有修改，也不要删除长期存在的未跟踪 mneme 项。先只读检查 git status 和当前实现。

v1.0 功能已经完成，当前建议的下一大版本是 Course Context，为 Exam Mode、Course 过滤导出和未来 Use Mode 提供基础。Standalone Random Concept Draw 建议收编为后续 Course/Exam Session 的能力，而不是先独立实现。

先不要直接编码。请先：
1. 核对 hand-off 与当前代码是否一致；
2. 说明 Course Context MVP 的领域模型、数据存储位置、与 Concept/FSRS 的边界；
3. 给出最小纵向切片和验收标准；
4. 指出需要新增或修改的 ADR/产品文档；
5. 等我确认后再实现。

所有固定 UI 标签使用英文。FSRS 继续完全控制 Card 调度；Course、Exam Attempt、Needs Work Signal 不得直接修改 FSRS。
```
