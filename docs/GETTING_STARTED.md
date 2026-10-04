# Your first five minutes with Mneme

This walkthrough uses synthetic notes and the offline Mock provider. No API key is needed. Mock produces deterministic proposals so you can learn the workflow; choose a real provider later for semantic extraction.

## Install

Follow [the installation instructions](../README.md#install). The plugin files must be directly inside the `mneme` folder, rather than another nested `mneme` folder.

## Try the approval workflow

1. Copy [Stable identity](../examples/Stable-identity.md) into your vault as a normal source note and open it.
2. Open **Settings → Mneme**. Turn on **Enable AI capture** and keep **Provider → Mock**. **Show Today’s Focus** is enabled by default in the **Scheduled Review** section.
3. Open the command palette and run **Mneme: Analyze Current Note**. Then run **Mneme: Open Inbox**.
4. Open a Concept proposal. Read its source evidence, edit the title or meaning if you wish, and choose **Accept & Next**. The Concept becomes a Markdown note in `Mneme/Concepts`.
5. Open that Concept Markdown note. Run **Mneme: Generate Cards from Current Concept**, then return to Inbox to review and accept a Card.
6. Run **Mneme: Open Review View**. Choose the Concept, read the question, click **Show Answer**, and use **Again / Hard / Good / Easy** to rate your recall. Future eligibility is scheduled by FSRS.

A Concept proposal and a Card proposal have separate approvals. Generating a proposal alone does not create its final learning Markdown file.

## Write your own learning material

Use **Mneme: Create Concept**, write its title and meaning, and save it. From the Concept, use **Create Card** or **Mneme: Create Card**, choose a Card Type, and write Front and Back. Direct authorship writes your own content without an Inbox approval step.

You can access a Concept's Cards from Concept Library. Turning off **Show Today’s Focus** hides the scheduled queue and preserves history; manual Concept Review from the Library remains available.

## Connect a real provider

In Mneme settings, choose **OpenAI** or **DeepSeek**, enter your API key, and choose a model supported by that provider. Keep the default base URL unless you intentionally use a compatible endpoint. Explicit analysis and drafting requests send learning content to that endpoint; see [Privacy](PRIVACY.md).

Generated learning prose follows the dominant language of the source note. **Suggest English aliases** is off by default and can add optional English display aliases to non-English titles.

## Common first-run questions

- **Analysis is unavailable:** enable AI capture and open an ordinary Markdown source note. Accepted Concept notes use the separate Card-generation command.
- **The same note will not produce another round:** unchanged notes are skipped using a content hash. Card generation also prevents repeating the same assessment content and policy while proposals are unresolved.
- **No Cards in Today’s Focus:** confirm a Card proposal was accepted and **Show Today’s Focus** is enabled. Cards already reviewed may be scheduled for later; browse the Concept in Concept Library.
- **I want to inspect the result:** open the Concept Markdown and its linked Card Group. Keep each Card's markers and ID when editing its content.
- **I want to move my vault:** move the Markdown files and Obsidian's Mneme plugin data together to retain scheduling and review history.

[Back to the README](../README.md)
