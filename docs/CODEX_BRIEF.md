# Codex Brief

## Purpose

This document is the concise engineering brief for Mneme. Read it with `AGENTS.md`, `CONTEXT.md`, and the current product specifications. ADRs in `docs/adr/` are authoritative when documents conflict.

Mneme is an Obsidian-native, AI-assisted learning layer for university students. It is Concept-centered, Markdown-first, and intentionally lower pressure than a review-debt system.

## Product Loop

AI-assisted capture:

```text
Source Note
-> AI proposes Concept changes
-> Student reviews / edits / accepts / rejects
-> Accepted knowledge is written as clean Concept Markdown
-> AI proposes Cards grounded in that approved Concept
-> Student reviews / edits / accepts / rejects
-> Accepted Cards append to the Concept's Card Group
-> Optional FSRS schedules each Card independently
-> When enabled, Mneme presents Concept-level learning state and Today’s Focus
```

Direct authorship is also first class:

```text
Student creates Concept
-> Clean approved Concept Markdown is written immediately
-> Cards may be proposed later through the same Card Review Gate
```

The Review Gate protects AI-proposed knowledge changes. It must not impersonate approval for content the student authored directly.

## Stable Product Principles

1. AI proposes; the student decides what enters the vault.
2. A student-authored Concept is already approved knowledge and needs no fake proposal.
3. Concept is the primary learning object; Card is an assessment instrument.
4. Concept Markdown and Card Group Markdown are the content source of truth.
5. `data.json` stores state, indexes, hashes, proposals, FSRS state, logs, and caches—not Card front/back content.
6. Scheduled Review is optional. When enabled, FSRS fully controls Today’s Focus eligibility and Concept aggregation cannot reschedule or cap eligible Cards. When hidden, Mneme preserves scheduled-review state and history, while manual Concept Review from Concept Library still records FSRS ratings.
7. Concept Learning State distinguishes memory risk, assessment coverage, and explicit student signals; it is not a mastery percentage.
8. Inbox is a review queue, not a debug dashboard. List items can Open or Reject; acceptance happens only inside the complete editable Review Gate.
9. Fixed product labels are English. Generated learning prose follows the Source Note's detected dominant language. AI Concept proposals always carry a canonical English Name separately from the primary-language Concept Title. Chinese learning content includes standard English names for technical concepts on first occurrence; English Concepts normally use the same value for Concept Title and English Name.
10. AI-generated Concept tags must be stable English lowercase slugs. Concept capture does not receive existing tags; AI should choose at most three broad topic-family tags and avoid near-duplicates, Concept-title tags, isolated adjectives, and generic tags such as `learning`, `theory`, `model`, `method`, `concept`, or `optimal`. After the provider response, Mneme locally normalizes exact matches against a transient Tag Catalog derived from approved Concept Markdown. Near matches remain visible review suggestions and are never silently merged. Historical user-approved tags remain valid.
11. Concept capture has no fixed proposal-count cap, but every proposal must represent a durable knowledge change, use a canonical context-independent Concept title, and carry verified Source Note evidence. Concept capture is context-free extraction, not vault reconciliation: Mneme does not send approved Concepts, Inbox proposals, existing Concept names, existing tags, or duplicate context to the provider. Duplicate or overlapping Concepts are allowed in Inbox and resolved later through explicit user-triggered Merge. Concept capture is extraction-first, not summary-first: a long textbook chunk should produce multiple independent Concepts when it contains multiple definitions, algorithms, hypotheses, boundaries, or distinctions.
12. Long Source Notes are analyzed completely through Markdown-aware extraction chunks with visible coverage; no provider request may silently stand in for an unprocessed remainder. Concept capture uses the smaller of the configured `AI chunk size` and Mneme's internal 6,000-character extraction chunk target so large course notes do not collapse into broad chapter summaries.
13. Review should feel like Today’s Focus, not accumulated debt. Non-due FSRS Cards remain Later and cannot be promoted by ranking. Every due or new eligible Card remains accessible; Mneme does not impose daily Concept, daily Card, or per-Concept Card caps.
14. Never silently discard or destructively migrate user Markdown.

## Markdown Model

Each approved Concept is one clean `Concept.md`-style Markdown note with minimal Mneme frontmatter. Empty template sections are omitted.

Each Concept has one canonical Card Group Markdown file, normally:

```text
Mneme/Cards/<Concept>/Cards.md
```

Every Card is a separately marked block with its own immutable ID, optional assessment type, and independent FSRS state. Legacy one-Card files remain readable; consolidation must be explicit and lossless.

Concept Title is editable primary-language learning content. English Name is the separately stored canonical English term. Concept Display Title combines them as `Concept Title (English Name)` when they differ and shows one value when they match. Mneme derives a new readable ASCII Concept ID from English Name at first write, such as `concept-spacing-effect`; the ID then remains immutable when either title changes.

Newly generated Card IDs are derived only from the written Concept ID plus Card Type. Mneme removes the `concept-` prefix to produce an identity such as `spacing-effect-definition`. When more than one Card for the same Concept and type is accepted, Mneme appends a numeric suffix such as `spacing-effect-definition-2`. AI does not choose Card IDs. The ID is shown in Inbox and becomes immutable once written; existing Cards are not renamed automatically.

Manual Card authorship is first-class. `Create Card` opens a dockable Composer for an approved Concept, requires the student to choose one built-in Card Type before writing Front and Back, and writes directly to the canonical Card Group without Inbox. AI-generated Card Type is locked during proposal review; Front, Back, and optional Rubric remain editable.

The Concept's declared `cards` link is the location authority for future Card writes. A title edit must not create a second Card Group.

When a new Concept write collides with an existing Concept identity or path, Mneme keeps the first Concept unsuffixed and assigns `-2`, `-3`, and so on to the later primary-language Concept Title, recomposed Display Title, path, Concept ID, and Card Group locator. For example, `间隔效应` becomes `间隔效应 - 2 (Spacing Effect)` with ID `concept-spacing-effect-2`; English Name remains the unsuffixed semantic term `Spacing Effect`. This is only locator/identity conflict resolution; it is not a merge, and Mneme never retroactively renames the first Concept to `-1`.

Concept Merge is a separate user-triggered workspace, available from Concept Library, Possible Duplicates, and the command palette. Manual selection and drafting always work without AI. Local similarity ranks candidates; optional AI may classify a compact shortlist or draft only Title, English Name, Core Meaning, and Why It Matters for the two selected Concepts. The student chooses the survivor, edits the draft, reviews a zero-write impact preview, and explicitly confirms. Deterministic code unions tags, Source Notes, and Related links, keeps the stronger importance and reviewable learning mode, writes Redirect Notes, and moves complete Card blocks with immutable card IDs, source stems, controls, events, and FSRS state preserved. Concurrent changes abort; partial failures roll back.

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

Do not expand ordinary stabilization work into Exam Mode, a built-in project recommender, Anki synchronization, automatic vault scanning, or a complex autonomous agent loop.

Anki integration is export-only: exported cards are independent copies. Use Mode should prefer exporting approved Concept context for another agent or chatbot.

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
