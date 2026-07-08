# Anki export creates isolated copies

Mneme may export approved Cards into an Anki-importable artifact, but it does not use Anki as a storage or review backend. Exported Cards are independent copies: Markdown remains Mneme's content source, Mneme FSRS remains Mneme's scheduler, and no content, scheduling state, or review history is synchronized in either direction. This deliberately trades continuous integration for a simple, reliable boundary that does not make Mneme depend on Anki.
