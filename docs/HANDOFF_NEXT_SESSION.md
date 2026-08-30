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

The branch name does not describe the current product scope. The v1.0 implementation and its supporting documentation were committed locally as:

```text
8f65f89 feat: complete Mneme v1.0 learning workflow
```

The current working tree may contain the post-v1.0 product-direction documentation revision plus the long-standing untracked `mneme` self-link and `release-artifacts/`.

Do not:

- reset, checkout, clean, discard, or broadly overwrite the working tree;
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
- exact-name conflict handling through Merge, Refine Name, Keep Both, or Cancel, with zero-write draft Merge and source-state preservation on Back/close;
- Possible Duplicate detection and two-Concept Guided Merge;
- Anki-style review layout with fixed action bar and Card-level controls;
- optional Scheduled Review and Concept-grouped Today’s Focus;
- one-way Anki TSV export and neutral Knowledge Context Pack export;
- Concept deletion with explicit confirmation and preservation of anonymous historical review records.

## Non-negotiable Product Contracts

### Knowledge approval

- AI proposes; the learner reviews, edits, accepts, or rejects.
- AI must not write final Concept or Card Markdown directly.
- Direct learner authorship writes immediately and does not pass through Inbox.

### Content and state ownership

- Concept is the primary learning object.
- Card is an assessment instrument for one Concept.
- Concept Markdown is the source of truth for Concept content.
- One Card Group Markdown file per Concept is the source of truth for Card content.
- `data.json` stores indexes, proposals, fingerprints, FSRS state, events, logs, and caches—not Card front/back content.

### Identity

- Durable state is keyed by immutable Concept and Card IDs, never file paths.
- Concept Title is primary-language and editable.
- English Alias is optional display/search metadata. `Suggest English aliases` defaults off; English titles never show a redundant alias field.
- New Concept IDs are opaque random IDs such as `concept-k7m3p9qx` and remain immutable. Existing readable IDs remain valid.
- New Card IDs are opaque random IDs such as `card-gjsl5r2n` and remain immutable. They are independent of Concept ID, Card Type, and content.
- AI never chooses final IDs.

### Review and FSRS

- FSRS fully owns Card scheduling.
- Concept is only an aggregate learning state.
- Only an explicit normal Card review and user-confirmed Again/Hard/Good/Easy rating updates FSRS.
- Concept ranking, AI suggestions, browsing, organization, and export must not mutate FSRS.
- Normal review must not call AI.
- Manual `Review Cards` from Concept Library does update FSRS because it is a real Card review.
- No daily Concept/Card caps may hide FSRS-eligible Cards.
- Concept-level `Pause Concept` is not part of the active product UI; controls operate on Cards.

### Merge and links

- AI extraction is context-free and does not receive the existing Concept library merely to prevent duplicates.
- Duplicate Concepts may enter Inbox; reconciliation is an explicit later action.
- Guided Merge is user-triggered, previewed, transactional, and rollback-safe.
- Exact-name conflict Merge never pre-creates the incoming Concept: Inbox keeps the Proposal, Manual creation keeps its Composer draft, and only Confirm Merge writes.
- AI may help draft only learning prose; deterministic code handles metadata, Cards, IDs, Related links, Redirect Notes, state migration, and conflicts.
- Merged Cards retain their immutable IDs and FSRS histories.
- The MVP has one symmetric Related relationship. Adding/removing it updates both Concept files.

### Language and tags

- Fixed UI and structural labels are English.
- Generated learning prose follows the Source Note’s dominant language.
- Non-English Concept titles may carry a canonical English Alias when the optional setting is enabled.
- Tags are English lowercase slugs.
- AI should prefer a few broad stable tags and avoid generic or near-duplicate tag explosion.

## Remaining v1.0 Publication Work

The feature set is complete, but publication readiness still requires:

- completing the disposable macOS `PRE_AI_ACCEPTANCE_CHECKLIST`;
- full plugin reload and Obsidian restart regression;
- Windows real-vault validation;
- clean installation using only `main.js`, `styles.css`, and `manifest.json`.

These are release gates, not missing v1.0 product functions.

## Current Product Direction

Mneme is a focused personal knowledge memory plugin for self-directed lifelong learners. The product loop is:

```text
Source Note
→ Concept
→ Card
→ Review
→ Concept Library
```

ADR 0019 replaces the earlier university/exam-oriented expansion plan. Course Context, Exam Mode, Exam Attempts, Use Mode, Use Projects, AI answer grading, project discovery, and a standalone learning agent are not planned.

AI remains an explicit, bounded assistant for Concept/Card extraction or drafting. Normal review, organization, browsing, scheduling, and export use deterministic local logic and do not call AI. This keeps the product understandable and maintainable with inexpensive API providers.

Knowledge Context Pack and Anki TSV remain ordinary export utilities, not separate modes.

### Recommended next versions

After v1.0 publication gates are complete:

1. **v1.1 Core Loop Friction and Cost** — improve onboarding, provider setup, bounded request transparency, failure recovery, accessibility, performance, and the transitions between capture, Inbox, Concept, and Review.
2. **v1.2 Library Stewardship** — improve Tag management, search/filtering, repair workflows, manual Concept selection for export, and large-library usability.

Candidate work must respond to observed user friction and must not introduce a new learning mode or durable state model.

### Evidence-gated possibilities

A stateless `Rediscover a Concept` entry point may be reconsidered only if real use supports it. It must not create Known/Needs Work state, bypass FSRS, call AI, or become a separate mode.

Lightweight organization may be reconsidered only if Tags, search, Related Concepts, Obsidian organization, and manual export selection prove insufficient. Do not implement Course Context by default.

## Recommended First Actions in the New Session

1. Inspect `git status` and the current diff without modifying it.
2. Re-read ADR 0019 and the current Product Spec/Roadmap before proposing new features.
3. Complete the remaining v1.0 publication gates before starting a major feature.
4. Identify a concrete core-loop friction from real use.
5. Produce a small, testable implementation plan that adds no new learning mode or competing state model.
6. Preserve existing Concept/Card/FSRS formats.
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

注意：v1.0 实现已提交为 `8f65f89`。当前工作树可能仍有产品路线文档修改，以及长期存在的未跟踪 `mneme` 自链接和 `release-artifacts/`。不得 reset、checkout、clean、覆盖或删除任何现有修改。先只读检查 git status 和当前实现。

v1.0 功能已经完成。产品定位已调整为面向自我导向终生学习者的个人知识记忆插件，核心闭环是 Source Note → Concept → Card → Review → Concept Library。

Course Context、Exam Mode、Use Mode、AI Answer Grading、Project Discovery 和内置学习 Agent 已退出产品路线。普通复习不得调用 AI；AI 仅用于用户明确触发、边界清楚的 Concept/Card 提取或草拟。Knowledge Context Pack 和 Anki TSV 只是导出工具，不是独立 Mode。

先不要直接编码。请先：
1. 核对 hand-off 与当前代码是否一致；
2. 完成或核对 v1.0 发布验收剩余项；
3. 从真实使用中识别一个核心闭环摩擦点；
4. 给出不新增 Mode 或竞争状态模型的最小改进和验收标准；
5. 等我确认后再实现。

所有固定 UI 标签使用英文。FSRS 继续完全控制 Card 调度；只有正常 Card Review 中由用户确认的 Again/Hard/Good/Easy 可以更新 FSRS。
```
