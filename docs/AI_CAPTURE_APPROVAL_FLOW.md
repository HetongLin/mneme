# AI Capture Approval Flow

The intended future flow is:

```text
Analyze Current Note
-> Check Source Hash
-> Extract Concept Candidates
-> Match Existing Concepts
-> Generate Proposals
-> Inbox Review
-> User edits / approves / rejects / merges
-> Accepted Concepts write Concept.md
-> Accepted Cards write Card.md
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

Card proposals still enter Inbox and require a separate review/edit/acceptance step before any `Card.md` is written.

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

Proposal entries may include machine-oriented `confidence`, `rationale`, and source evidence. These fields support validation and internal review, but they must not automatically appear in `Concept.md`, `Card.md`, Inbox primary UI, or Concept Library primary UI.

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

Cards are generated later from written `Concept.md`, then reviewed and accepted separately before any `Card.md` is written.

Current implementation supports two post-review write paths:

- `add_view` appends an approved perspective to the resolved Concept's `## Views` section and preserves its Source Note provenance when supplied. Identical retries are idempotent, while same-title conflicts fail without overwriting Markdown.
- `link_existing_concept` appends an approved Source Note reference to the resolved Concept and records the provenance link in plugin state.
- `update_concept` applies approved Core Meaning and Why It Matters replacements at section boundaries, while preserving unrelated Markdown and recording supplied provenance.
- `new_card` writes approved Card proposals generated from a written Concept.

AI-proposed merge acceptance and AI-proposed revise, split, merge, or retire Card operations remain future work because their safe approval writers are not implemented yet. Manual stable-ID Card retirement is available from Review. Manual Concept Guided Merge is available from reviewed Possible Duplicate candidates and cannot be executed as one-click Inbox acceptance.

## Inbox Shell

`KnowledgeProposalStore` persists future Inbox proposals in plugin data.

The Inbox is product-facing review space, not a lifecycle-state dashboard. It summarizes active work as To Review, Concept Proposals, Card Proposals, and Invalid items. Developer lifecycle states such as rejected, stale, and written are not primary Inbox counters.

Future tasks will add proposal payload schemas, AI generation, diff preview, editing, and Markdown writing.

## Proposal Detail Review

Knowledge proposals now support typed payloads for future Concept and Card changes.

The Inbox can open a proposal detail modal with a temporary JSON payload editor. Users can save edits, approve valid payloads, or reject proposals. Approval still does not write Markdown.

`Mneme: Add Sample Knowledge Proposal` is a temporary debug command for manual Inbox validation. It creates proposal data only; it does not call AI or write files.

## Inbox Acceptance And Markdown Writer

Proposal acceptance is the explicit commit action:

```text
Review proposal -> Accept Concept / Accept Card -> Markdown write
```

`Accept Concept` validates the proposal, writes `Concept.md`, and marks the proposal `written` only after a successful vault write.

`Accept Card` validates the proposal, writes one parser-compatible Card Markdown file, and marks the proposal `written` only after a successful vault write.

The initial writer supports `new_concept` and `new_card` proposals only. Unsupported proposal kinds stay in Inbox until future structured editors and diff/patch writers exist.

Written `new_concept` proposals create editable Concept Markdown files directly in the configured Concepts folder. Written `new_card` proposals create one parseable Card Markdown file inside the Concept's card folder using Mneme's existing card marker syntax.

Written Cards do not receive FSRS state during writing; they enter the normal parser/review pipeline after the vault is refreshed or reloaded.

Successful `new_concept` writes can also index approved Concept-source links. Mneme stores these links in plugin data and updates the analyzed Source Note's `linkedConceptIds` when source analysis state exists.

Active Inbox shows actionable proposals only: `suggested`, `opened`, `edited`, and `stale`. Written and rejected proposals are not a user-facing history archive; they should disappear from the active Inbox.

Inbox Refresh and `Mneme: Resync Mneme Index` reconcile plugin data against the current vault. If a proposal's source note no longer exists, Mneme may remove that unactioned stale proposal from plugin data. Approved Concept-source provenance is different: a missing Source marks the relationship stale while retaining its last known path, hash, relation, and evidence until the student explicitly relinks or removes it.

Reconciliation never deletes user Markdown. It only cleans plugin index/cache/proposal state so `data.json` follows the current vault instead of acting as a second content source of truth.

Raw JSON editing remains available under Advanced / Raw JSON for debugging and escape hatches, but the primary flow should present proposal-specific fields and `Accept Concept` / `Accept Card` actions.

## Developer Tools Gate

Acceptance fixtures, sample proposals, and diagnostic logging commands are developer tools. They are hidden from the command palette unless Developer Tools is enabled in Mneme settings. This keeps the normal Inbox focused on reviewing proposed knowledge changes while preserving local validation utilities.

## Readable And Identifiable Markdown

Generated `Concept.md` is a human-facing learning note with minimal Mneme frontmatter for identification. It links to its review card folder, uses concise Source Notes, and keeps machine metadata in plugin data.

Each generated Card Markdown file is one reviewable Card. It includes minimal card frontmatter, links back to the Concept, and keeps the existing parser-compatible card marker syntax.

Cards are not dumped into `Concept.md` by default. `sourceHash`, proposal ids, review state, FSRS state, due dates, stability, difficulty, and raw JSON remain outside the main Markdown reading flow.

## Concept Library Foundation

The Concept Library scans existing `Concept.md` files with Mneme concept frontmatter and shows clean Concept summaries.

It is a browsing and opening layer only. Users edit Concepts by opening Markdown. Future AI Capture can use these summaries to match new source-note candidates against existing Concepts before proposing duplicates, merges, updates, or new views.

## AI Does Not Write Permanent Markdown

AI output is proposal data until accepted by the user.

Suggested Concepts and Cards do not become `Concept.md` or `Card.md` content until a user explicitly accepts the proposal.

## No Accept All As Primary UX

Bulk operations may exist later, but the default UX should encourage reading, editing, and review.

Inbox is a long-term knowledge-change approval layer, not a one-time generation queue.
