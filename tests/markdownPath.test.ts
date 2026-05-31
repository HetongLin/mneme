import assert from "node:assert/strict";
import {
	buildCardPath,
	buildConceptPath,
	createMnemeConceptId,
	ensureUniquePath,
	slugifyForFilename,
	toObsidianInternalLink,
} from "../src/utils/markdownPath";

{
	assert.equal(slugifyForFilename("Information Gain: Many-Valued Attributes?"), "Information-Gain-Many-Valued-Attributes");
}

{
	assert.equal(slugifyForFilename(" : / ? * "), "Untitled");
}

{
	assert.equal(buildConceptPath("Mneme//Concepts/", "Encapsulation"), "Mneme/Concepts/Encapsulation/Concept.md");
}

{
	assert.equal(buildCardPath("/Mneme\\Cards", "Encapsulation"), "Mneme/Cards/Encapsulation/Card.md");
}

{
	assert.equal(ensureUniquePath(new Set(), "Mneme/Concepts/Encapsulation/Concept.md"), "Mneme/Concepts/Encapsulation/Concept.md");
}

{
	const existingPaths = new Set([
		"Mneme/Concepts/Encapsulation/Concept.md",
		"Mneme/Concepts/Encapsulation/Concept-2.md",
	]);

	assert.equal(
		ensureUniquePath(existingPaths, "Mneme/Concepts/Encapsulation/Concept.md"),
		"Mneme/Concepts/Encapsulation/Concept-3.md",
	);
}

{
	assert.equal(toObsidianInternalLink("Mneme/Concepts/Information Gain/Concept.md"), "[[Mneme/Concepts/Information Gain/Concept]]");
}

{
	assert.equal(toObsidianInternalLink("\\Mneme//Cards/Info/Card.md"), "[[Mneme/Cards/Info/Card]]");
}

{
	assert.equal(toObsidianInternalLink("Mneme/Cards/Info/Card.md", "Info Cards"), "[[Mneme/Cards/Info/Card|Info Cards]]");
}

{
	assert.equal(toObsidianInternalLink(""), "");
}

{
	assert.equal(toObsidianInternalLink("/Users/linus/Mneme_ob/Note.md"), "[[Users/linus/Mneme_ob/Note]]");
}

{
	assert.equal(createMnemeConceptId("Information Gain"), "concept-information-gain");
}

console.log("Markdown path tests passed.");
