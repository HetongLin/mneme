import assert from "node:assert/strict";
import MnemePlugin from "../src/main";
import { DEFAULT_SETTINGS, type MnemeSettings } from "../src/models/settings";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import { createDefaultPluginData, ReviewStateStore } from "../src/services/reviewStateStore";
import type { MnemePluginData } from "../src/models/reviewState";

class BarrierStorage {
	data: MnemePluginData = createDefaultPluginData();
	private saveBarrier?: { started: () => void; release: Promise<void> };

	async loadData(): Promise<unknown> {
		return structuredClone(this.data);
	}

	async saveData(data: MnemePluginData): Promise<void> {
		const barrier = this.saveBarrier;
		this.saveBarrier = undefined;
		if (barrier) {
			barrier.started();
			await barrier.release;
		}
		this.data = structuredClone(data);
	}

	pauseNextSave(): Promise<() => void> {
		let started!: () => void;
		let release!: () => void;
		const startedPromise = new Promise<void>((resolve) => { started = resolve; });
		const releasePromise = new Promise<void>((resolve) => { release = resolve; });
		this.saveBarrier = { started, release: releasePromise };
		return startedPromise.then(() => release);
	}
}

class FakePlugin extends (MnemePlugin as { new (...args: never[]): object }) {
	declare settings: MnemeSettings;
	declare reviewStateStore: ReviewStateStore;
	private readonly storage: BarrierStorage;

	constructor(storage: BarrierStorage) {
		super();
		this.storage = storage;
		this.settings = { ...DEFAULT_SETTINGS };
		this.reviewStateStore = new ReviewStateStore(this, new FsrsReviewScheduler());
	}

	loadData(): Promise<unknown> { return this.storage.loadData(); }
	saveData(data: MnemePluginData): Promise<void> { return this.storage.saveData(data); }
}

function settingsWithFsrsEnabled(enabled: boolean): MnemeSettings {
	return { ...DEFAULT_SETTINGS, fsrsEnabled: enabled };
}

function saveSettings(plugin: FakePlugin): Promise<void> {
	return MnemePlugin.prototype.saveSettings.call(plugin as never);
}

async function run(): Promise<void> {
	{
		const storage = new BarrierStorage();
		const plugin = new FakePlugin(storage);
		await plugin.reviewStateStore.load();
		const release = storage.pauseNextSave();
		const review = plugin.reviewStateStore.recordReview("card-review-first", "good");
		const releaseSave = await release;
		plugin.settings = settingsWithFsrsEnabled(false);
		const saveSettingsPromise = saveSettings(plugin);
		releaseSave();
		await Promise.all([review, saveSettingsPromise]);

		assert.equal(storage.data.reviewStates["card-review-first"]?.reviewCount, 1);
		assert.equal(storage.data.settings.fsrsEnabled, false);
		await plugin.reviewStateStore.recordReview("card-review-second", "good");
		assert.equal(storage.data.settings.fsrsEnabled, false);
		assert.equal(storage.data.reviewStates["card-review-second"]?.reviewCount, 1);
	}

	{
		const storage = new BarrierStorage();
		const plugin = new FakePlugin(storage);
		await plugin.reviewStateStore.load();
		plugin.settings = settingsWithFsrsEnabled(false);
		const release = storage.pauseNextSave();
		const saveSettingsPromise = saveSettings(plugin);
		const releaseSave = await release;
		const review = plugin.reviewStateStore.recordReview("card-review-queued", "hard");
		releaseSave();
		await Promise.all([saveSettingsPromise, review]);

		assert.equal(storage.data.settings.fsrsEnabled, false);
		assert.equal(storage.data.reviewStates["card-review-queued"]?.reviewCount, 1);
		await plugin.reviewStateStore.recordReview("card-review-after-settings", "good");
		assert.equal(storage.data.settings.fsrsEnabled, false);
	}
}

export const done = run();
