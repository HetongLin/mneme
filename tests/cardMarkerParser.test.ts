import assert from "node:assert/strict";
import { parseCardMarkers } from "../src/services/cardMarkerParser";

const validCard = [
	"# Information Gain",
	"",
	"<!-- MNEME:FRONT:start -->",
	"Why does information gain tend to favor attributes with many values?",
	"<!-- MNEME:FRONT:end -->",
	"",
	"<!-- MNEME:BACK:start -->",
	"Because many-valued attributes can create smaller, purer subsets.",
	"<!-- MNEME:BACK:end -->",
	"",
	"<!-- MNEME:RUBRIC:start -->",
	"- Mentions many-valued attributes",
	"- Mentions smaller or purer subsets",
	"<!-- MNEME:RUBRIC:end -->",
].join("\n");

{
	const parsed = parseCardMarkers(validCard);

	assert.equal(parsed.isValid, true);
	assert.equal(parsed.front, "Why does information gain tend to favor attributes with many values?");
	assert.equal(parsed.back, "Because many-valued attributes can create smaller, purer subsets.");
	assert.equal(parsed.rubric, "- Mentions many-valued attributes\n- Mentions smaller or purer subsets");
	assert.deepEqual(parsed.errors, []);
	assert.deepEqual(parsed.warnings, []);
}

{
	const parsed = parseCardMarkers(validCard
		.replace("<!-- MNEME:FRONT:start -->\nWhy does information gain tend to favor attributes with many values?\n<!-- MNEME:FRONT:end -->", ""));

	assert.equal(parsed.isValid, false);
	assert.equal(parsed.errors.some((issue) => issue.code === "missing_required_section" && issue.section === "FRONT"), true);
}

{
	const parsed = parseCardMarkers(validCard
		.replace("<!-- MNEME:BACK:start -->\nBecause many-valued attributes can create smaller, purer subsets.\n<!-- MNEME:BACK:end -->", ""));

	assert.equal(parsed.isValid, false);
	assert.equal(parsed.errors.some((issue) => issue.code === "missing_required_section" && issue.section === "BACK"), true);
}

{
	const parsed = parseCardMarkers(validCard
		.replace("<!-- MNEME:RUBRIC:start -->\n- Mentions many-valued attributes\n- Mentions smaller or purer subsets\n<!-- MNEME:RUBRIC:end -->", ""));

	assert.equal(parsed.isValid, true);
	assert.equal(parsed.rubric, "");
	assert.equal(parsed.warnings.some((issue) => issue.code === "missing_recommended_section" && issue.section === "RUBRIC"), true);
}

{
	const parsed = parseCardMarkers(`${validCard}\n\nSome extra Markdown outside markers.`);

	assert.equal(parsed.isValid, true);
	assert.equal(parsed.front, "Why does information gain tend to favor attributes with many values?");
}

{
	const malformed = [
		"<!-- MNEME:FRONT:start -->",
		"Unclosed front",
		"<!-- MNEME:BACK:start -->",
		"Back",
		"<!-- MNEME:BACK:end -->",
	].join("\n");
	const parsed = parseCardMarkers(malformed);

	assert.equal(parsed.isValid, false);
	assert.equal(parsed.errors.some((issue) => issue.code === "unclosed_section" && issue.section === "FRONT"), true);
}

{
	const duplicateFront = `${validCard}\n<!-- MNEME:FRONT:start -->\nDuplicate\n<!-- MNEME:FRONT:end -->`;
	const parsed = parseCardMarkers(duplicateFront);

	assert.equal(parsed.isValid, false);
	assert.equal(parsed.errors.some((issue) => issue.code === "duplicate_section" && issue.section === "FRONT"), true);
	assert.equal(parsed.front, "Why does information gain tend to favor attributes with many values?");
}
