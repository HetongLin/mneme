import { spawnSync } from "node:child_process";

const testCommands = [
	["npm", ["run", "test:parser"]],
	["npm", ["run", "test:review-state"]],
	["npm", ["run", "test:review-queue"]],
	["npm", ["run", "test:scheduler"]],
	["npm", ["run", "test:concept-memory"]],
	["npm", ["run", "test:concept-queue"]],
	["npm", ["run", "test:fsrs-scheduler"]],
];

for (const [command, args] of testCommands) {
	const label = [command, ...args].join(" ");

	console.log(`\n=== ${label} ===`);

	const result = spawnSync(command, args, {
		stdio: "inherit",
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

console.log("\nAll Mneme tests passed.");
