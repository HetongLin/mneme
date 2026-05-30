import assert from "node:assert/strict";
import {
	buildCardPath,
	buildConceptPath,
	ensureUniquePath,
	slugifyForFilename,
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

console.log("Markdown path tests passed.");
