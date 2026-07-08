import assert from "node:assert/strict";
import { removeConceptSourceEntry } from "../src/services/conceptSourceRemover";

{
	const markdown = [
		"# A", "", "Outside [[Notes/Old]]", "", "## Source Notes", "", "> [!info]- Source Notes",
		"> - [[Notes/Old|Old]]", ">   - relation: origin", ">   - evidence: old evidence",
		"> - [[Notes/Keep]]", ">   - relation: supporting", "", "## Related Concepts", "", "[[Notes/Old]]",
	].join("\n");
	const result = removeConceptSourceEntry(markdown, "Notes/Old.md");
	assert.equal(result.status, "removed");
	assert.equal(result.removals, 1);
	assert.doesNotMatch(result.markdown, /old evidence/);
	assert.match(result.markdown, /\[\[Notes\/Keep\]\]/);
	assert.equal(result.markdown.match(/\[\[Notes\/Old\]\]/g)?.length, 2);
}

{
	const markdown = "# A\r\n\r\n## Source Notes\r\n\r\n> - [[Notes/Old]]\r\n";
	assert.equal(removeConceptSourceEntry(markdown, "Notes/Old").markdown, "# A\r\n\r\n## Source Notes\r\n\r\n");
}

console.log("Concept Source remover tests passed.");
