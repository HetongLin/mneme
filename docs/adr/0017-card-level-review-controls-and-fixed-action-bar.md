# ADR 0017: Card-level review controls and fixed action bar

Status: Accepted

## Context

Mneme Review previously placed answer controls and an expanded management panel inside the Card body. Long answers moved the rating controls and required scrolling past secondary actions. `Pause Concept` also removed every Card in a Concept from Today’s Focus even though FSRS schedules Cards independently, making a Concept-level aggregate act like a second scheduling authority.

The daily review surface should support a narrow recall loop while keeping repair and lifecycle operations reachable without competing with ratings.

## Decision

- The Card body is an independently scrollable reading area. Before reveal it shows Front; after `Show Answer` it keeps Front visible and renders Back beneath it with the same Markdown treatment.
- A stable action bar remains at the bottom of Mneme Review and does not move with Card content.
- Before reveal, the bar contains `Edit`, `Show Answer`, and `More`.
- After reveal, the same bar contains `Edit`, `Again`, `Hard`, `Good`, `Easy`, and `More`.
- After the current Concept's Card Group is complete, the completion message remains in the reading area while `View Concept` and, when available, `Review Next Concept` move into the same fixed bottom action bar.
- `More` opens a compact Obsidian menu rather than expanding content in the Card body. The menu is anchored to the button's fixed bounds, so its placement does not depend on the exact pointer position inside the button. It contains `View Concept`, `Skip for Now`, `Review Tomorrow`, `Suspend Card`, `Archive Card`, `Card Info`, and `Delete Card…` when the Card has a stable ID.
- Saving a Card from an active review session re-reads the Card Group and restores the same Card by stable Card ID. Mneme keeps the review session, Card position, counters, and answer-reveal state, then renders the saved Front and Back in place. A full Review refresh must not be used for this edit path because it resets the session.
- Deleting the current Card from `More` preserves the active review session. Mneme removes the deleted Card from the session and shows the next Card at the same position; if none remains, it shows Review Complete and refreshes Today's Focus in the background. Deleted Cards are counted separately rather than being reported as reviewed.
- Today’s Focus Concept cards remain compact and equal-height. Diagnostic details never expand inside a grid card. An information control opens one non-modal Concept Details inspector on the right; selecting another Concept replaces its contents, and selecting the active control or Close dismisses it. Narrow views present the same inspector as a bottom sheet.
- `Advanced Diagnostics` is an opt-in maintenance surface rather than part of ordinary review. It is hidden by default and appears at the bottom of Mneme Review only when `Show advanced diagnostics` is enabled in Developer Tools. Enabling or disabling it refreshes open Review views without changing Card content, FSRS state, or review history.
- The Concept Details inspector groups information into Overview, Coverage, and a bounded scrolling Card Status list. It avoids repeating Importance and Card count already visible on the Concept card face.
- `Pause Concept` and `Resume Concept` are removed from user-facing review controls. Existing persisted Concept pauses are cleared when Mneme Review refreshes. Card Markdown, FSRS state, and review history are not changed.
- Scheduling exclusions remain Card-level. `Review Tomorrow` is the user-facing name for the existing next-local-day deferral. `Archive Card` is the user-facing name for the existing reversible retirement state, whose persisted key remains `retiredCards` for compatibility.

## Consequences

- The primary review loop remains visually stable for short and long answers.
- Front and Back remain available together for self-assessment after reveal.
- Secondary actions no longer lengthen the review page or displace ratings.
- Card corrections are visible immediately without forcing the student to restart or relocate the current review session.
- Concept remains a learning-state aggregation and navigation surface, not a bulk scheduling switch.
- Existing pause data is a legacy compatibility field only and is not an active product feature.
