const FALLBACK_FILENAME = "Untitled";

export function slugifyForFilename(title: string): string {
	const cleaned = title
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
		.replace(/[#^[\]{}]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (!cleaned) {
		return FALLBACK_FILENAME;
	}

	return cleaned
		.split(" ")
		.map((part) => part.length > 0 ? capitalize(part) : part)
		.join("-");
}

export function buildConceptPath(conceptsFolder: string, title: string): string {
	return normalizeVaultPath(`${conceptsFolder}/${slugifyForFilename(title)}.md`);
}

export function buildCardPath(cardsFolder: string, conceptTitleOrId: string, cardTitleOrType = "Card"): string {
	const conceptSlug = slugifyForFilename(conceptTitleOrId);
	const cardSlug = slugifyForFilename(cardTitleOrType);
	const filename = cardSlug.toLocaleLowerCase().startsWith(conceptSlug.toLocaleLowerCase())
		? cardSlug
		: `${conceptSlug} - ${cardSlug}`;

	return normalizeVaultPath(`${cardsFolder}/${conceptSlug}/${filename}.md`);
}

export function buildCardGroupPath(cardsFolder: string, conceptTitleOrId: string): string {
	const conceptSlug = slugifyForFilename(conceptTitleOrId);

	return normalizeVaultPath(`${cardsFolder}/${conceptSlug}/Cards.md`);
}

export function ensureUniquePath(existingPaths: Set<string>, desiredPath: string): string {
	const normalizedDesired = normalizeVaultPath(desiredPath);

	if (!existingPaths.has(normalizedDesired)) {
		return normalizedDesired;
	}

	const extensionIndex = normalizedDesired.lastIndexOf(".");
	const slashIndex = normalizedDesired.lastIndexOf("/");
	const hasExtension = extensionIndex > slashIndex;
	const basePath = hasExtension ? normalizedDesired.slice(0, extensionIndex) : normalizedDesired;
	const extension = hasExtension ? normalizedDesired.slice(extensionIndex) : "";

	let suffix = 2;
	let candidate = `${basePath}-${suffix}${extension}`;

	while (existingPaths.has(candidate)) {
		suffix += 1;
		candidate = `${basePath}-${suffix}${extension}`;
	}

	return candidate;
}

export function normalizeVaultPath(path: string): string {
	return path
		.trim()
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/+/, "");
}

export function toObsidianInternalLink(path: string, display?: string): string {
	const normalizedPath = normalizeVaultPath(path).replace(/\.md$/i, "");

	if (!normalizedPath) {
		return "";
	}

	if (display && display.trim().length > 0) {
		return `[[${normalizedPath}|${display.trim()}]]`;
	}

	return `[[${normalizedPath}]]`;
}

export function createMnemeConceptId(title: string): string {
	const slug = slugifyForFilename(title)
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	return `concept-${slug || "untitled"}`;
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
