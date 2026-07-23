# ADR 0015: Use readable derived identities without making titles identity

Status: Accepted

## Context

Mneme's Markdown files must remain understandable and repairable outside the plugin, but titles and paths are editable presentation rather than safe durable identity. Non-English Concepts also need a standard English term for bilingual display and for a stable ASCII identity stem. Asking the AI to invent IDs, or deriving Card identity from whichever title happens to be visible, makes language drift, title edits, duplicate Concepts, Merge, and FSRS state unsafe.

## Decision

- `mneme_title` stores the editable Concept Title in the Source Note's primary language. It contains only that name, not a parenthesized English translation.
- `mneme_english_name` stores the canonical English Name separately. New non-English Concepts require it; for an English Concept it normally equals Concept Title. English Name describes the semantic term and never receives a duplicate suffix.
- In manual Concept creation, Title and English Name remain one reviewed naming pair. The UI uses local script detection to hide the redundant field for English Titles and reveal it after the other learning fields for non-English Titles. The student may enter English Name manually or explicitly request an AI suggestion after completing Core Meaning. Mneme does not call AI automatically; the optional request sends only Title and Core Meaning and can return only the canonical English Name. The suggestion cannot set Concept ID directly, and changing Title invalidates it.
- Concept Display Title is derived by Mneme. It is `Concept Title` when Concept Title and English Name are equivalent, otherwise `Concept Title (English Name)`. It is presentation, not identity.
- New Concept ID is program-owned, readable ASCII, and immutable after the first successful write. Mneme derives it from English Name as `concept-<english-slug>`, for example `concept-spacing-effect`. AI output and editable fields cannot directly set it.
- When a new write collides by path or Concept ID, the first written Concept remains unsuffixed. Later Concepts receive `-2`, `-3`, and so on. The suffix is added to Concept Title, Concept Display Title, Markdown path, Concept ID, and Card Group locator as one allocation decision. For example, the second Chinese Concept becomes Title `间隔效应 - 2`, Display Title `间隔效应 - 2 (Spacing Effect)`, and ID `concept-spacing-effect-2`. English Name remains `Spacing Effect`.
- A Card has no separate v1 Card Title. Its Front is the human-facing question; Inbox and maintenance surfaces identify it by Card ID.
- New Card ID is program-owned and immutable after write. Mneme removes exactly one reserved `concept-` prefix from the owning Concept ID and appends Card Type: `concept-spacing-effect` + `definition` becomes `spacing-effect-definition`. A semantic name that itself begins with “Concept” preserves that word: `concept-concept-learning` + `definition` becomes `concept-learning-definition`. A same-type collision in that Card Group receives `-2`, `-3`, and so on.
- Card ID is derived from the written Concept ID, never from Concept Title, English Name, Card Front, file path, or provider text. This preserves the Concept duplicate suffix in Card ownership, for example `spacing-effect-2-definition`.
- Existing valid Concept and Card IDs are not renamed or migrated automatically. Legacy combined bilingual titles remain readable; explicit repair or migration is a separate reviewed operation.

## Consequences

- Markdown identities remain legible enough to diagnose or repair manually while durable state still follows immutable IDs.
- Renaming or translating a Concept does not rename its accepted Cards or disconnect FSRS history.
- Two independently accepted same-name Concepts can coexist safely until the user explicitly invokes Guided Merge.
- Merge must preserve original Card IDs even after Cards move into a surviving Card Group; readable source stems are historical identity, not a reason to rewrite FSRS keys.
