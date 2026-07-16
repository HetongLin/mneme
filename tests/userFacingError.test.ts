import assert from "node:assert/strict";
import { formatUserFacingError, formatUserFacingMessage } from "../src/utils/userFacingError";

assert.equal(
	formatUserFacingError(new Error("Vault write failed."), "Could not save."),
	"Vault write failed.",
);
assert.equal(
	formatUserFacingError("  File\nchanged while editing.  ", "Could not save."),
	"File changed while editing.",
);
assert.equal(formatUserFacingError({ code: 500 }, "Could not save."), "Could not save.");
assert.equal(formatUserFacingMessage("   ", "  Try again. "), "Try again.");
assert.equal(formatUserFacingMessage("x".repeat(30), "Fallback", 20), `${"x".repeat(17)}...`);
assert.equal(formatUserFacingMessage("Short", "Fallback", 5), "Short");

console.log("User-facing error tests passed.");
