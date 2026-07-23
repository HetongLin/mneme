# ADR 0018: Manual Card authoring and AI Card Type lock

Status: Accepted

## Context

Mneme already supports direct Concept authorship, but Cards can otherwise enter the vault only through AI proposals. Students also need to write precise Cards themselves while reading an approved Concept. At the same time, allowing a reviewer to change an AI proposal's assessment type turns a content edit into an untracked semantic rewrite: Front, Back, and Rubric may no longer match the selected type or the generation policy that produced it.

## Decision

- `Create Card` is a first-class direct-authoring workflow for an existing approved Concept.
- It opens a dockable Card Composer so the Concept or Concept Library may remain visible beside it.
- Concept and Card Type appear before Front, Back, and optional Rubric. The student chooses one of Mneme's nine built-in Card Types before writing the Card.
- Front and Back are required. Rubric remains optional.
- A manually authored Card writes directly to the Concept's canonical Card Group and does not manufacture an Inbox proposal or approval step.
- Manual and AI-accepted Cards use the same Card Group markers and readable immutable Card ID allocator: `<concept-stem>-<type>`, followed by `-2`, `-3`, and so on for further Cards of that type.
- Card Composer drafts auto-save in plugin data. After a successful write, the Concept remains selected, content fields clear, Card Type returns to Definition, and a temporary result banner links to the Concept and Card Markdown.
- AI Card proposal review shows Card Type as read-only. The reviewer may edit Front, Back, and Rubric, but may not reclassify the proposal. Rejecting and regenerating is the path when the assessment category itself is wrong.

## Consequences

- Students can author Cards without API access or unnecessary approval friction.
- Manual Card Type selection remains flexible while AI generation stays governed by enabled Card Types and fixed generation semantics.
- Both entry paths preserve one canonical Card storage format and stable FSRS identity.
- Changing the type of an already written Card remains outside this workflow because its type participates in human-readable identity and assessment meaning.
