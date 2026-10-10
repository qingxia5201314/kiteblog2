import { BlogPostDraft } from './blog';

export interface DraftAutosaveEnvelope {
  schemaVersion: 1;
  editingId: string | null;
  updatedAt: string;
  draft: BlogPostDraft;
}

export interface DraftAutosaveRepository {
  load(): BlogPostDraft | undefined;
  loadEnvelope(): DraftAutosaveEnvelope | undefined;
  save(draft: BlogPostDraft, metadata?: { editingId?: string | null; updatedAt?: string }): DraftAutosaveEnvelope;
  clear(): void;
}

function parseEnvelope(value: string): DraftAutosaveEnvelope | undefined {
  try {
    const parsed = JSON.parse(value) as DraftAutosaveEnvelope | BlogPostDraft;
    if ('schemaVersion' in parsed && parsed.schemaVersion === 1 && 'draft' in parsed) {
      return parsed;
    }
    return {
      schemaVersion: 1,
      editingId: null,
      updatedAt: new Date().toISOString(),
      draft: parsed as BlogPostDraft
    };
  } catch {
    return undefined;
  }
}

export function createDraftAutosaveRepository(storageKey = 'kitepop-editor-draft'): DraftAutosaveRepository {
  return {
    load() {
      const value = localStorage.getItem(storageKey);
      if (!value) return undefined;
      return parseEnvelope(value)?.draft;
    },

    loadEnvelope() {
      const value = localStorage.getItem(storageKey);
      return value ? parseEnvelope(value) : undefined;
    },

    save(draft, metadata = {}) {
      const envelope: DraftAutosaveEnvelope = {
        schemaVersion: 1,
        editingId: metadata.editingId ?? null,
        updatedAt: metadata.updatedAt || new Date().toISOString(),
        draft
      };
      localStorage.setItem(storageKey, JSON.stringify(envelope));
      return envelope;
    },

    clear() {
      localStorage.removeItem(storageKey);
    }
  };
}
