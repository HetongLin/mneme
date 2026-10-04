# Contributing to Mneme

Thanks for helping improve Mneme, an Obsidian-native knowledge memory plugin for self-directed learners.

## Before you start

Please read the project guidance in `AGENTS.md` and the relevant documents under `docs/`. Architecture and product decisions recorded in `docs/adr/` are authoritative when documents disagree. Keep changes focused and preserve existing Markdown and data formats.

Mneme treats Markdown as the content source of truth. AI may propose bounded knowledge changes, but a person reviews and approves those changes before Mneme writes them. People may also author Concepts and Cards directly without an artificial approval step.

## Local development

From this directory:

```bash
npm ci
npm run build
npm run test:all
```

The build creates the production bundle. The full test command runs the local test suite. For a focused change, run the tests that cover the affected behavior; documentation-only changes do not need native Obsidian acceptance testing.

## Pull requests

Describe the user problem, the behavior that changed, and the validation you ran. Keep pull requests small enough to review. Include screenshots or a short reproduction when a UI change needs visual context.

Please do not include API keys, private vault content, or other secrets in issues or pull requests. Use the security process in `SECURITY.md` for vulnerabilities.

Pull requests receive human review. Automated tools can assist contributors, but AI-generated changes still need a human author who understands and approves the result.
