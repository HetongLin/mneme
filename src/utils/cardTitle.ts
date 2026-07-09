export function formatCardTypeTitle(value: string): string {
	return value
		.split(/[_\s-]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase())
		.join(" ") || "Card";
}
