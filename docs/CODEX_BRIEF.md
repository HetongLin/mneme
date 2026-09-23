# Codex Brief

## Purpose

This document is the concise engineering brief for Mneme. Read it with `AGENTS.md`, `CONTEXT.md`, and the current product specifications. ADRs in `docs/adr/` are authoritative when documents conflict.

Mneme is an Obsidian-native, AI-assisted knowledge memory plugin for self-directed lifelong learners. It is Concept-centered, Markdown-first, and intentionally lower pressure than a review-debt system.

## Product Loop

AI-assisted capture:

```text
Source Note
-> AI proposes Concept changes
-> Learner reviews / edits / accepts / rejects
-> Accepted knowledge is written as clean Concept Markdown
-> AI proposes Cards grounded in that approved Concept
-> Learner reviews / edits / accepts / rejects
-> Accepted Cards append to the Concept's Card Group
-> Optional FSRS schedules each Card independently
-> When enabled, Mneme presents Concept-level learning state and Today’s Focus
```

Direct authorship is also first class:

```text
Learner creates Concept
-> Clean approved Concept Markdown is written immediately
-> Cards may be proposed later through the same Card Review Gate
```

The Review Gate protects AI-proposed knowledge changes. It must not impersonate approval for content the learner authored directly.

## Stable Product Principles

1. AI proposes; the learner decides what enters the vault.
2. A learner-authored Concept is already approved knowledge and needs no fake proposal.
3. Concept is the primary learning object; Card is an assessment instrument.
4. Concept Markdown and Card Group Markdown are the content source of truth.
5. `data.json` stores state, indexes, hashes, proposals, FSRS state, logs, and caches—not Card front/back content.
6. Scheduled Review is optional. When enabled, FSRS fully controls Today’s Focus eligibility and Concept aggregation cannot reschedule or cap eligible Cards. When hidden, Mneme preserves scheduled-review state and history, while manual Concept Review from Concept Library still records FSRS ratings.
7. Concept Learning State distinguishes memory risk and assessment coverage; it is not a mastery percentage.
8. Inbox is a review queue, not a debug dashboard. List items can Open or Reject; acceptance happens only inside the complete editable Review Gate.
9. Fixed product labels are English. Generated learning prose follows the Source Note's detected dominant language. English Alias is optional display metadata controlled by `Suggest English aliases`, which defaults off. When disabled, AI Concept proposals omit it. When enabled, non-English titles may receive a separate canonical English Alias; English titles do not duplicate themselves into the alias field.
10. AI-generated Concept tags must be stable English lowercase slugs. Concept capture does not receive existing tags; AI should choose at most three broad topic-family tags and avoid near-duplicates, Concept-title tags, isolated adjectives, and generic tags such as `learning`, `theory`, `model`, `method`, `concept`, or `optimal`. After the provider response, Mneme locally normalizes exact matches against a transient Tag Catalog derived from approved Concept Markdown. Near matches remain visible review suggestions and are never silently merged. Historical user-approved tags remain valid.
11. Concept capture has no fixed proposal-count cap, but every proposal must represent a durable knowledge change, use a canonical context-independent Concept title, and carry verified Source Note evidence. Concept capture is context-free extraction, not vault reconciliation: Mneme does not send approved Concepts, Inbox proposals, existing Concept names, existing tags, or duplicate context to the provider. Duplicate or overlapping Concepts are allowed in Inbox and resolved later through explicit user-triggered Merge. Concept capture is extraction-first, not summary-first: a long textbook chunk should produce multiple independent Concepts when it contains multiple definitions, algorithms, hypotheses, boundaries, or distinctions.
12. Long Source Notes are analyzed completely through Markdown-aware extraction chunks with visible coverage; no provider request may silently stand in for an unprocessed remainder. Concept capture uses the smaller of the configured `AI chunk size` and Mneme's internal 6,000-character extraction chunk target so long notes do not collapse into broad document summaries.
13. Review should feel like Today’s Focus, not accumulated debt. Non-due FSRS Cards remain Later and cannot be promoted by ranking. Every due or new eligible Card remains accessible; Mneme does not impose daily Concept, daily Card, or per-Concept Card caps.
14. Never silently discard or destructively migrate user Markdown.
15. AI calls are explicit and bounded to knowledge extraction or drafting. Normal review never calls AI; organization, browsing, scheduling, and export remain deterministic local operations.

## Markdown Model

Each approved Concept is one clean `Concept.md`-style Markdown note with minimal Mneme frontmatter. Empty template sections are omitted.

Each Concept has one canonical Card Group Markdown file, normally:

```text
Mneme/Cards/<Concept>/Cards.md
```

Every Card is a separately marked block with its own immutable ID, optional assessment type, and independent FSRS state. Legacy one-Card files remain readable; consolidation must be explicit and lossless.

Concept Title is editable primary-language learning content. English Alias is optional separately stored display/search metadata. The setting defaults off; when enabled, ordinary Concept editors reveal the field only for a non-Latin Title. Concept Display Title combines the values as `Concept Title (English Alias)` when an alias exists and differs. Mneme allocates new opaque Concept IDs independently, such as `concept-k7m3p9qx`; the ID remains immutable when titles, aliases, or paths change.

Mneme allocates new opaque Card IDs independently, such as `card-gjsl5r2n`. Concept ID, Card Type, Card Front, title, path, and provider output do not participate in Card identity. AI does not choose Card IDs. Existing valid Card IDs remain unchanged.

Manual Card authorship is first-class. `Create Card` opens a dockable Composer for an approved Concept, requires the learner to choose one built-in Card Type before writing Front and Back, and writes directly to the canonical Card Group without Inbox. AI-generated Card Type is locked during proposal review; Front, Back, and optional Rubric remain editable.

The Concept's declared `cards` link is the location authority for future Card writes. A title edit must not create a second Card Group.

When a new Concept path collides, Mneme adds `-2`, `-3`, and so on only to the new Markdown path and matching Card Group locator. Concept Title, English Alias, and random Concept ID remain unchanged. An ID collision is handled by generating another random ID. This is locator allocation, not a merge.

Concept Merge is a separate user-triggered workspace, available from Concept Library, Possible Duplicates, the command palette, and the exact-name conflict gate. Manual selection and drafting always work without AI. Ordinary Guided Merge reconciles two written Concepts: local similarity ranks candidates; optional AI may classify a compact shortlist or draft Title, Core Meaning, Why It Matters, and—only when enabled—an English Alias. The learner chooses the survivor, edits the draft, reviews a zero-write impact preview, and explicitly confirms. Deterministic code unions tags, Source Notes, and Related links, keeps the stronger importance and reviewable learning mode, writes Redirect Notes, and moves complete Card blocks with immutable card IDs, source stems, controls, events, and FSRS state preserved. Concurrent changes abort. Confirmed multi-file writes use a separate recovery journal and a content-free pending receipt; Resume Guided Merge skips applied files and completes the remaining reviewed writes, preserving conflicting edits. See ADR 0031.

Exact-name conflict Merge instead reconciles one written Concept with an incoming Inbox Proposal or Manual Concept draft. Choosing Merge never writes a temporary Concept or allocates a `-2` path. Back, Cancel, and closing the workspace preserve the source Proposal/Composer draft; only Confirm Merge updates the written Concept and then completes the Proposal or clears the Manual draft. Its editable prose draft may persist in `data.json`, but its preview is always rebuilt. After confirmation, a content-free Incoming Merge receipt precedes the single Concept write. `Resume Incoming Concept Merge` completes state if the reviewed Markdown already landed; if the original Markdown remains, it retains the draft and requires a new preview. It never reapplies or rolls back Markdown during recovery (ADR 0030).

Related Concepts are a separate, user-authored organization layer. The MVP has one symmetric `Related` relationship represented as clean Obsidian links under `## Related Concepts` in both Concept files. First-pass AI capture does not create these links or receive the Concept library. Adding or removing a link updates both files transactionally; Guided Merge unions, rewires, and deduplicates Related neighbors while removing self-links.

## Card Generation

Cards can be generated only from a written, reviewable Concept—not from a Source Note or a Mneme Concept passed through `Analyze Current Note`.

Duplicate protection uses a generation fingerprint derived from assessable Concept sections plus Card generation policy, chunking policy, AI chunk size, and enabled Card types. After a successful generation call, accepting or rejecting its proposals does not unlock another round for the same fingerprint. Metadata-only changes such as tags, paths, provenance, or navigation links also do not unlock another generation round; assessable learning content, Card-generation chunking policy, or enabled Card types must change.

AI prompts are fixed for Concept capture. Mneme owns the required JSON shape, proposal kinds, field names, evidence, language contract, source identity, product policy, and enum values. Settings do not expose free-form Concept/Card prompt or style guidance because that destabilizes validation. Card generation exposes only `Allowed AI card types`, selected from the built-in `cardType` enum: `definition`, `distinction`, `procedure`, `example`, `trap`, `proof`, `application`, `mastery`, and `other`. Enabled Card types are allowed options, not required quotas; AI must skip unsuitable enabled types rather than forcing them.

Card generation duplicate protection records a generation fingerprint built from assessable Concept content plus Card generation policy and enabled Card types. Metadata-only edits still do not unlock a round; changing enabled Card types can unlock a new attempt after existing proposals are resolved. When `definition` is enabled and neither the written Card Group nor active Inbox contains a Definition Card for the Concept, a generation result must include one grounded Definition Card; all other enabled types remain optional and must be skipped when unsupported.

Existing accepted Card fronts are passed to the provider as a Coverage Map. The provider should add missing assessment outcomes or perspectives rather than paraphrasing existing Cards. A new generation attempt requires changed assessable learning content or changed enabled Card types after existing active proposals are resolved.

Long approved Concepts are split into Markdown-aware Card-generation chunks instead of being silently truncated. Each chunk sees existing Card fronts plus earlier generated fronts from the same run as the Coverage Map, and the final Inbox result aggregates grounded proposals across the complete assessable Concept content.

## Review UX

When FSRS scheduling is enabled, the main review flow is deliberately narrow:

1. Show Front.
2. `Show Answer` reveals Back.
3. Show `Again / Hard / Good / Easy` on one row.
4. A rating updates only that Card's FSRS state and advances.

The Card body scrolls independently while a stable Anki-style action bar remains at the bottom. Before reveal the bar contains `Edit / Show Answer / More`; after reveal it keeps Front above Back and replaces the center action with `Again / Hard / Good / Easy`. `More` is a compact menu containing View Concept, Skip for Now, Review Tomorrow, Suspend Card, Archive Card, Card Info, and Delete Card. Rubric and technical details live in Card Info. Rubric may guide self-assessment but must not introduce knowledge absent from Back. Concept-level pause is not a review control; FSRS and explicit queue controls operate on Cards. Use `Open Concept Markdown` only for the raw Markdown source file.

When Scheduled Review is disabled, Review View explains that Today’s Focus is hidden and exposes no scheduled-review queue or rating controls. Manual Concept Review remains available from Concept Library and updates Card memory. Re-enabling Today’s Focus resumes from the real FSRS history; it does not reset or shift due dates.

## Scope Boundaries

Do not expand ordinary work into Course Context, Exam Mode, Use Mode, AI answer grading, a built-in project recommender, Anki synchronization, automatic vault scanning, or a complex autonomous agent loop.

Anki integration is export-only: exported cards are independent copies. Knowledge Context Pack is a neutral export utility, not a mode or an embedded agent workflow.

A future stateless `Rediscover a Concept` entry point is only a possibility to validate against real usage. It must not create a parallel learning state, mark Concepts known or weak, bypass FSRS, or call AI.

## Engineering Rules

- Use TypeScript and Obsidian Plugin API conventions.
- Keep orchestration thin in `main.ts`; put domain logic in focused services.
- Preserve existing persisted formats or provide explicit compatibility reads.
- Use stable Concept and Card IDs for durable state; paths and titles are mutable locators.
- Validate AI output and malformed Markdown without crashing.
- Make writes idempotent where retries are possible.
- Keep migrations explicit, previewable, and rollback-safe.
- Update product docs or add an ADR when an implementation changes a domain invariant.

## Verification

For code changes, run at least:

```bash
npm run build
npm run test:all
```

Then report the commit, changed behavior, verification results, and focused manual Obsidian checks. Preserve the long-standing untracked `mneme` item unless the user explicitly says otherwise.

## Local References

When an API detail is uncertain, inspect:

- `../../references/obsidian/obsidian-sample-plugin`
- `../../references/obsidian/obsidian-api`
- `../../references/libraries/ts-fsrs`

External engineering skill repositories under `../../coding-skills/` are read-only references, not Mneme source code.
