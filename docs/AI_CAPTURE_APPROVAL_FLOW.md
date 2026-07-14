# AI Capture Approval Flow

The current product flow is:

```text
Analyze Current Note
-> Check Source Hash
-> Extract Concept Candidates
-> Match Existing Concepts
-> Generate Proposals
-> Inbox Review
-> User edits / approves / rejects / merges
-> Accepted Concepts write Concept.md
-> Accepted Cards append to the Concept's Card Group
-> Written Cards enter FSRS
-> Review Mode groups due/new Cards by Concept
```

## Source-First But Concept-Centered

AI analyzes Source Notes, but the durable learning unit is Concept.

Correct:

```text
Source Note -> Concept proposals -> approved Concepts -> Card proposals -> approved Cards
```

Incorrect:

```text
Source Note -> direct Card dump
```

Cards are generated to test Concepts, not to replace Concepts.

## Concept-First Capture Contract

Initial source analysis can create Concept-stage proposals only:

- `new_concept`
- `link_existing_concept`
- `add_view`
- `update_concept`
- `merge_concept`

It must not create Card proposals during the same initial step.

After a Concept is reviewed, approved, and explicitly written to `Concept.md`, the user can choose a separate Generate Cards action. That later stage may create Card-stage proposals:

- `new_card`
- `revise_card`
- `split_card`
- `merge_card`
- `retire_card`

Card proposals still enter Inbox and require a separate review/edit/acceptance step before any Card Group content is written.

Future Scan Vault behavior follows the same rule: first propose Concepts, then generate Cards from written Concepts.

## Hash-Based Scanning

Source Notes should be re-analyzed only when changed.

Store:

- path
- mtime
- size
- content hash

Fast path:

- if `mtime` and `size` are unchanged, skip reading content if a previous record exists

Accurate path:

- if metadata changed, read content and compute hash
- if content hash is unchanged, skip AI analysis
- if content hash changed, mark stale and generate proposals

## Runtime Foundation

`Mneme: Analyze Current Note` indexes source note metadata and content hash. With AI Capture enabled, it also creates validated Concept-stage proposals in Inbox.

It persists a `SourceAnalysisRecord` in plugin data through `SourceAnalysisStore`. This lets Mneme skip unchanged notes before an unnecessary AI call is made.

This command creates Concept proposals only. It does not generate Cards or write Markdown.

`Mneme: Analyze Current Note` must not run on written Mneme Concept files. Concepts are approved knowledge artifacts, not raw Source Notes; re-analyzing them as sources risks duplicate or circular Concept proposals.

## Provider Boundary

Task 026A and Task 026A.1 established the provider infrastructure. Task 027 connects that boundary to Analyze Current Note.

Current provider pieces:

- AI Capture settings in Mneme settings, disabled by default
- a provider adapter interface for structured proposal generation
- strict `mneme.ai.proposals.v1` schemas for Concept capture and Card generation
- runtime validation and normalization into `KnowledgeProposal`
- a deterministic Mock provider for tests and offline development
- an OpenAI Responses API provider using Structured Outputs
- a DeepSeek OpenAI-compatible provider using JSON output plus local validation
- log-safe provider configuration diagnostics that do not include raw API keys

The provider interface returns structured AI response data plus diagnostics and provider metadata. Analyze Current Note validates and normalizes the raw response before it can become `KnowledgeProposal` data, then places valid Concept proposals in Inbox. Acceptance, Markdown writers, FSRS, and Daily Review remain separate boundaries.

OpenAI Structured Outputs provides provider-side enforcement against JSON Schema. Mneme still treats provider output as untrusted until local runtime validation passes.

DeepSeek support uses an OpenAI-compatible request boundary and Bearer-key configuration shape. DeepSeek JSON Output requests valid JSON, while Mneme still requires application-side schema validation and normalization.

## Structured Output Contract

AI output must become validated and normalized `KnowledgeProposal[]` before it is shown in Inbox.

The concept-capture response uses:

- `schemaVersion: "mneme.ai.proposals.v1"`
- `mode: "concept_capture"`
- `source.path`
- `source.hash`
- `proposals`
- `warnings`

Proposal entries may include machine-oriented `confidence`, `rationale`, and source evidence. These fields support validation and internal review, but they must not automatically appear in `Concept.md`, Card Group Markdown, Inbox primary UI, or Concept Library primary UI.

The Card-generation response uses the same schema version and source envelope with `mode: "card_generation"`. The current accepted kind is `new_card`, whose payload identifies the written Concept and provides front, back, rubric, and card type.

In `concept_capture` mode, providers may return only Concept-stage proposal kinds:

- `new_concept`
- `link_existing_concept`
- `add_view`
- `update_concept`
- `merge_concept`

In `concept_capture` mode, providers must not return Card-stage proposal kinds:

- `new_card`
- `revise_card`
- `split_card`
- `merge_card`
- `retire_card`

`new_concept` payloads include proposed organization `tags`. Tags are generated with the Concept proposal, shown for user review, and written to `Concept.md` frontmatter only when the Concept proposal is accepted.

Generated learning content follows the Source Note's dominant language. Mneme detects English or Chinese from the full Source content before truncating provider input and sends an authoritative `languageContract` with every Concept or Card request. Existing Concepts, UI language, tags, filenames, and prompt examples cannot override this contract. English Sources require English generated titles and prose. Chinese Sources require Chinese-first titles and prose; the first occurrence of each technical concept or established proper term includes its standard English name in parentheses, and Concept titles use `中文名称 (English Name)` when a standard English name exists. Other or non-prose Sources fall back to an explicit source-dominant-language instruction. Evidence quotes remain exact and are never translated. In the AI payload, `coreMeaning` states what the Concept is and its defining mechanism, while `whyItMatters` adds usefulness, relevance, or application rather than repeating Core Meaning. Concept updates use `proposedCoreMeaning` and `proposedWhyItMatters` with the same distinction.

Concept capture has no fixed proposal-count limit because long Source Notes may contain many durable ideas. Quality is constrained per proposal instead: a new Concept represents one independently explainable, reusable knowledge unit; headings, organizational labels, isolated facts, incidental examples, anecdotes, background sentences, and repeated paraphrases do not become standalone Concepts. Mneme compares candidates with existing Concepts and prefers Link, Update, Add View, or Merge over creating a duplicate. The provider returns no proposals when the Source Note contains no durable knowledge worth creating or linking and no meaningful Concept change. Core Meaning stays compact and identifies the Concept and its defining mechanism; Why It Matters contains only usefulness, relevance, or application.

Concept titles use the shortest unambiguous canonical or established name and name the knowledge itself rather than the current note's purpose, application context, domain, tool, course, or lesson. Contextual suffixes such as `for Hypothesis Evaluation`, `in Healthcare`, or `using Python` are not added unless the complete phrase is itself an established, genuinely distinct Concept. For example, Mneme proposes `Bayes Theorem`, not `Bayes Theorem for Hypothesis Evaluation`; hypothesis evaluation belongs in Why It Matters or a View. If the canonical Concept already exists, Mneme prefers Add View, Update, or Link instead of creating a context-qualified duplicate.

Every Concept-stage proposal requires at least one exact quote from the current Source Note. Mneme verifies the evidence path and quote before a proposal enters Inbox, conservatively restoring whitespace, line-break, or Obsidian math-delimiter differences to the exact Source Markdown. Unverifiable evidence is discarded, and a proposal with no verified Source grounding is discarded. A response whose non-empty proposal set has no grounded proposal is rejected.

Generated mathematical notation follows Obsidian MathJax Markdown. The provider uses `$...$` for short inline math within a sentence and `$$...$$` on separate lines for standalone, long, emphasized, or multi-line equations. It must not emit bare LaTeX, `\(...\)`, `\[...\]`, formula code fences, or spaces immediately inside inline math delimiters. As a deterministic fallback, Mneme removes delimiter-adjacent spaces from likely inline formulas before AI payload Markdown enters Inbox and whenever a Live Preview editor returns to preview. Display math, escaped dollars, code, and exact evidence quotes remain unchanged.

AI should prefer stable English lowercase tag slugs, but the Review Gate preserves user-approved non-English tags. Mneme normalizes tag punctuation without erasing established vault language.

Cards are generated later from written `Concept.md`, then reviewed and accepted separately before any Card block is appended.

Current implementation supports two post-review write paths:

- `add_view` appends an approved perspective to the resolved Concept's `## Views` section and preserves its Source Note provenance when supplied. Identical retries are idempotent, while same-title conflicts fail without overwriting Markdown.
- `link_existing_concept` appends an approved Source Note reference to the resolved Concept and records the provenance link in plugin state.
- `update_concept` applies approved Core Meaning and Why It Matters replacements at section boundaries, while preserving unrelated Markdown and recording supplied provenance.
- `new_card` writes approved Card proposals generated from a written Concept.

AI-proposed merge acceptance and AI-proposed revise, split, merge, or retire Card operations remain future work because their safe approval writers are not implemented yet. Manual stable-ID Card retirement is available from Review. Manual Concept Guided Merge is available from reviewed Possible Duplicate candidates and cannot be executed as one-click Inbox acceptance.

## Inbox Shell

`KnowledgeProposalStore` persists Inbox proposals in plugin data.

The Inbox is product-facing review space, not a lifecycle-state dashboard. It summarizes active work as To Review, Concept Proposals, Card Proposals, and Invalid items. Developer lifecycle states such as rejected, stale, and written are not primary Inbox counters.

Current proposal kinds use typed payloads, structured editing, validation, and explicit Markdown writers. Destructive future proposal kinds still require dedicated preview-and-rollback designs before they can be accepted.

## Proposal Detail Review

Knowledge proposals support typed payloads for Concept and Card changes.

The Inbox can open a proposal detail modal. The Inbox list is only a queue: it shows proposal titles and allows `Open` or direct `Reject`; it must not allow acceptance.

The proposal detail modal is the Review Gate. It shows editable proposal-specific fields first, then concrete Source Evidence for Concept proposals or Concept Grounding for Card proposals, then validation and Advanced / Raw JSON. Markdown-bearing fields use Live Preview and expose their original `$...$` / `$$...$$` source when selected. `Accept & Next` auto-saves the current structured fields before validation and writing; no separate `Save Edits` step is required. `Accept & Next` and `Reject & Next` continue within the same stage without allowing unseen bulk acceptance.

`Mneme: Add Sample Knowledge Proposal` is a temporary debug command for manual Inbox validation. It creates proposal data only; it does not call AI or write files.

## Inbox Acceptance And Markdown Writer

Proposal acceptance is the explicit commit action:

```text
Open proposal -> read/edit content -> inspect evidence -> Accept -> Markdown write
```

For a Concept proposal, `Accept` first saves the current structured editor values, validates that saved proposal, writes `Concept.md`, and marks the proposal `written` only after a successful vault write.

For a Card proposal, `Accept & Next` first saves the current structured editor values, validates the saved proposal, appends one parser-compatible block to the Concept's Card Group, and marks the proposal `written` only after a successful vault write.

The initial writer supports `new_concept` and `new_card` proposals only. Unsupported proposal kinds stay in Inbox until future structured editors and diff/patch writers exist.

Written `new_concept` proposals create editable Concept Markdown files directly in the configured Concepts folder. Written `new_card` proposals append one parseable, independently identified block to the Concept's canonical Card Group file.

Written Cards do not receive FSRS state during writing; they enter the normal parser/review pipeline after the vault is refreshed or reloaded.

Card proposal generation records a Learning Content Fingerprint built from assessable Concept sections and supplies existing Card fronts as a Coverage Map. Active proposals, previously written proposals, or a `coverage_complete` provider result for the same fingerprint block repetition; presentation/provenance edits do not unlock another round, while a fully rejected proposal round may be retried.

Card grounding is anchored back to the current approved Concept before proposals enter Inbox. Exact quotes pass directly. Mneme may conservatively restore a quote when it differs only by whitespace, line breaks, or Obsidian `$` / `$$` math delimiters; the stored Evidence is always replaced with the exact Concept Markdown substring. Unverifiable Evidence is discarded, and a Card proposal with no verified grounding is discarded. One malformed Evidence item or proposal does not reject grounded sibling proposals, but a response with no grounded Card proposals still fails.

Successful `new_concept` writes can also index approved Concept-source links. Mneme stores these links in plugin data and updates the analyzed Source Note's `linkedConceptIds` when source analysis state exists.

Active Inbox shows actionable proposals only: `suggested`, `opened`, `edited`, and `stale`. Written and rejected proposals are not a user-facing history archive; they should disappear from the active Inbox.

Inbox Refresh and `Mneme: Resync Mneme Index` reconcile plugin data against the current vault. If a proposal's source note no longer exists, Mneme may remove that unactioned stale proposal from plugin data. Approved Concept-source provenance is different: a missing Source marks the relationship stale while retaining its last known path, hash, relation, and evidence until the student explicitly relinks or removes it.

Reconciliation never deletes user Markdown. It only cleans plugin index/cache/proposal state so `data.json` follows the current vault instead of acting as a second content source of truth.

Raw JSON editing remains available under Advanced / Raw JSON for debugging and escape hatches, but the primary flow presents proposal-specific fields, readable evidence or grounding, and bottom `Accept & Next` / `Reject & Next` / `Close` actions.

## Developer Tools Gate

Acceptance fixtures, sample proposals, and diagnostic logging commands are developer tools. They are hidden from the command palette unless Developer Tools is enabled in Mneme settings. This keeps the normal Inbox focused on reviewing proposed knowledge changes while preserving local validation utilities.

## Readable And Identifiable Markdown

Generated `Concept.md` is a human-facing learning note with minimal Mneme frontmatter for identification. It omits empty placeholder sections, links to its Card Group, uses concise Source Notes, and keeps machine metadata in plugin data.

Each generated Card is one block in the Concept's Card Group Markdown file. The group links back to the Concept, while every block keeps an immutable Card ID, optional type, and parser-compatible marker sections.

Cards are not dumped into `Concept.md` by default. `sourceHash`, proposal ids, review state, FSRS state, due dates, stability, difficulty, and raw JSON remain outside the main Markdown reading flow.

## Concept Library Foundation

The Concept Library scans existing `Concept.md` files with Mneme concept frontmatter and shows clean Concept summaries.

It is a Markdown-backed management layer: students can create and open Concepts, edit supported metadata and sections, generate Cards, and enter reviewed repair or merge flows. The scanner also supplies existing Concept summaries to AI Capture so new Source Notes can propose links, updates, or views instead of unnecessary duplicates.

## AI Does Not Write Permanent Markdown

AI output is proposal data until accepted by the user.

Suggested Concepts and Cards do not become `Concept.md` or Card Group content until a user explicitly accepts the proposal.

## No Accept All As Primary UX

Bulk operations may exist later, but the default UX should encourage reading, editing, and review.

Inbox is a long-term knowledge-change approval layer, not a one-time generation queue.
