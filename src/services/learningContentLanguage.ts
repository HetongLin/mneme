export type LearningContentLanguageCode = "en" | "source" | "zh";

export interface LearningContentLanguageContract {
	authority: "source_content";
	outputLanguage: string;
	outputLanguageCode: LearningContentLanguageCode;
	rules: string[];
}

export function detectLearningContentLanguage(content: string): LearningContentLanguageCode {
	const prose = stripNonProseMarkdown(content);
	const hanCharacterCount = prose.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu)?.length ?? 0;
	const latinWordCount = prose.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/gu)?.length ?? 0;

	if (hanCharacterCount === 0 && latinWordCount === 0) return "source";
	if (hanCharacterCount === 0) return "en";
	if (latinWordCount === 0) return "zh";

	return hanCharacterCount >= Math.max(4, latinWordCount) ? "zh" : "en";
}

export function createLearningContentLanguageContract(content: string): LearningContentLanguageContract {
	const outputLanguageCode = detectLearningContentLanguage(content);

	if (outputLanguageCode === "en") {
		return {
			authority: "source_content",
			outputLanguage: "English",
			outputLanguageCode,
			rules: [
				"Write all generated learning titles and prose in English.",
				"Do not translate generated Concept or Card content into Chinese.",
				"Use standard English technical terminology and preserve established abbreviations.",
			],
		};
	}

	if (outputLanguageCode === "zh") {
		return {
			authority: "source_content",
			outputLanguage: "Chinese",
			outputLanguageCode,
			rules: [
				"Write generated learning titles and prose primarily in Chinese.",
				"On the first occurrence of each technical concept or established proper term, append its standard English name in parentheses.",
				"Keep established English abbreviations such as MAP, FSRS, and API.",
			],
		};
	}

	return {
		authority: "source_content",
		outputLanguage: "Source note dominant language",
		outputLanguageCode,
		rules: [
			"Follow the dominant natural language of the supplied source content.",
			"Do not infer the output language from existing Concepts, UI language, tags, or filenames.",
		],
	};
}

function stripNonProseMarkdown(content: string): string {
	return content
		.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, " ")
		.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu, " ")
		.replace(/`[^`]*`/gu, " ")
		.replace(/\$\$[\s\S]*?\$\$/gu, " ")
		.replace(/\$[^$\r\n]*\$/gu, " ")
		.replace(/https?:\/\/\S+/gu, " ");
}
