import assert from "node:assert/strict";
import {
	isCanonicalEnglishName,
	normalizeConceptNames,
	shouldOfferEnglishAlias,
	resolveConceptEnglishName,
} from "../src/services/conceptNaming";

assert.equal(shouldOfferEnglishAlias("Information Gain"), false);
assert.equal(shouldOfferEnglishAlias("C++"), false);
assert.equal(shouldOfferEnglishAlias("Café Society"), false);
assert.equal(shouldOfferEnglishAlias("间隔效应"), true);
assert.equal(shouldOfferEnglishAlias("字典学习 (Dictionary Learning)"), true);
assert.equal(shouldOfferEnglishAlias("Интервальное повторение"), true);
assert.equal(shouldOfferEnglishAlias("123"), true);
assert.equal(
	normalizeConceptNames("Information Gain", "Gain of Information").displayTitle,
	"Information Gain",
);

assert.deepEqual(normalizeConceptNames("Information Gain"), {
	displayTitle: "Information Gain",
	englishName: "",
	title: "Information Gain",
});
assert.deepEqual(normalizeConceptNames("字典学习"), {
	displayTitle: "字典学习",
	englishName: "",
	title: "字典学习",
});
assert.deepEqual(normalizeConceptNames("字典学习", "Dictionary Learning"), {
	displayTitle: "字典学习 (Dictionary Learning)",
	englishName: "Dictionary Learning",
	title: "字典学习",
});
assert.deepEqual(normalizeConceptNames("Information Gain", "Gain of Information"), {
	displayTitle: "Information Gain",
	englishName: "",
	title: "Information Gain",
});
assert.deepEqual(normalizeConceptNames("字典学习", "Dictionary Learning", false), {
	displayTitle: "字典学习",
	englishName: "",
	title: "字典学习",
});
assert.equal(resolveConceptEnglishName(undefined, "Information Gain"), undefined);
assert.equal(isCanonicalEnglishName("Dictionary Learning"), true);
assert.equal(isCanonicalEnglishName("Régression linéaire"), true);
assert.equal(isCanonicalEnglishName("Русский ABC"), false);
assert.equal(isCanonicalEnglishName("字典学习"), false);

console.log("Concept naming tests passed.");
