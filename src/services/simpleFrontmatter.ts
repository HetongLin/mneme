export function parseSimpleFrontmatter(content: string): Record<string, string> {
	if (!content.startsWith("---\n")) {
		return {};
	}

	const endIndex = content.indexOf("\n---", 4);
	if (endIndex === -1) {
		return {};
	}

	const frontmatter = content.slice(4, endIndex);
	const values: Record<string, string> = {};

	for (const line of frontmatter.split("\n")) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) continue;
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (key && value) values[key] = stripYamlQuotes(value);
	}

	return values;
}

function stripYamlQuotes(value: string): string {
	if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}

	return value;
}
