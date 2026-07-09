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
	assert.equal(buildConceptPath("Mneme//Concepts/", "Encapsulation"), "Mneme/Concepts/Encapsulation.md");
}

{
	assert.equal(
		buildCardPath("/Mneme\\Cards", "Encapsulation", "Definition"),
		"Mneme/Cards/Encapsulation/Encapsulation - Definition.md",
	);
}

{
	assert.equal(ensureUniquePath(new Set(), "Mneme/Concepts/Encapsulation.md"), "Mneme/Concepts/Encapsulation.md");
}

{
	const existingPaths = new Set([
		"Mneme/Concepts/Encapsulation.md",
		"Mneme/Concepts/Encapsulation-2.md",
	]);

	assert.equal(
		ensureUniquePath(existingPaths, "Mneme/Concepts/Encapsulation.md"),
		"Mneme/Concepts/Encapsulation-3.md",
	);
}

{
	assert.equal(toObsidianInternalLink("Mneme/Concepts/Information Gain.md"), "[[Mneme/Concepts/Information Gain]]");
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
