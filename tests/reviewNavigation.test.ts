import assert from "node:assert/strict";
import {
	extractFirstConceptSourcePath,
	formatReviewCompletion,
	parseObsidianLinkPath,
} from "../src/services/reviewNavigation";

{
	const markdown = [
		"# Encapsulation",
		"",
		"## Source Notes",
		"",
		"> [!info]- Source Notes",
		"> - [[Courses/OOP/Lecture 03|Lecture 03]]",
		"> - [[Courses/OOP/Book Chapter]]",
		"",
		"## Related Concepts",
		"",
		"[[Abstraction]]",
	].join("\n");

	assert.equal(extractFirstConceptSourcePath(markdown), "Courses/OOP/Lecture 03");
}

{
	assert.equal(
		parseObsidianLinkPath("[[Mneme/Concepts/Encapsulation/Concept|Encapsulation]]"),
		"Mneme/Concepts/Encapsulation/Concept",
	);
	assert.equal(parseObsidianLinkPath("[[Notes/OOP#Encapsulation]]"), "Notes/OOP");
	assert.equal(parseObsidianLinkPath("Notes/OOP.md"), "Notes/OOP.md");
}

{
	const markdown = [
		"# Encapsulation",
		"",
		"## Related Concepts",
		"",
		"[[Abstraction]]",
	].join("\n");

	assert.equal(extractFirstConceptSourcePath(markdown), undefined);
}

{
	assert.deepEqual(formatReviewCompletion(3, 0), {
		label: "3 cards reviewed",
		reviewedCount: 3,
		skippedCount: 0,
	});
	assert.deepEqual(formatReviewCompletion(3, 1), {
		label: "2 reviewed · 1 skipped",
		reviewedCount: 2,
		skippedCount: 1,
	});
	assert.deepEqual(formatReviewCompletion(1, 1), {
		label: "0 reviewed · 1 skipped",
		reviewedCount: 0,
		skippedCount: 1,
	});
}

console.log("Review navigation tests passed.");
