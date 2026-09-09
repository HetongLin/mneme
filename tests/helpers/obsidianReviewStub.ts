// Import-time Obsidian shells for the ReviewView action harness. Tests replace
// rendering and storage and never call these UI methods or touch a real Vault.
export class Component {}
export class ItemView {}
export class Modal {}
export class Menu {}
export class Notice {}
export class TFile {}
export const MarkdownRenderer = {};
export function setIcon(): void {}
export function normalizePath(path: string): string { return path; }
export function parseYaml(): never { throw new Error("parseYaml is unavailable in this import-only test."); }
