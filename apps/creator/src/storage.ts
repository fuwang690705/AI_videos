// Copyright (c) 2026 AI Content Studio contributors.
// Licensed under AGPL-3.0-or-later; browser adapter for Moyin Creator.
// Do not emulate Electron APIs. Persist only this isolated browser app's drafts.
export const fileStorage = {
  getItem: async (name: string) => localStorage.getItem(`studio-moyin:${name}`),
  setItem: async (name: string, value: string) => {
    localStorage.setItem(`studio-moyin:${name}`, value);
  },
  removeItem: async (name: string) => {
    localStorage.removeItem(`studio-moyin:${name}`);
  },
};

// This adapter starts in a separate namespace; desktop data is never migrated.
// Upstream retains this compatibility hook as a no-op as well.
export const migrateFromLocalStorage = async (
  _key: string,
): Promise<void> => {};
