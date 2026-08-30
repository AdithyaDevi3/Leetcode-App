import type { SystemDesignDocument } from '@leetcode-app/domain';

export type LocalSystemDesignDraft = {
  document: SystemDesignDocument;
  submittedAt: string | null;
};

export const localSystemDesignDraftKey = 'leetcode-app.local-system-design-draft.v1';

export function deserializeLocalSystemDesignDraft(value: string | null): LocalSystemDesignDraft | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<LocalSystemDesignDraft>;
    const document = parsed.document;
    if (
      !document || typeof document.title !== 'string' ||
      !Array.isArray(document.requirements) || !Array.isArray(document.assumptions) ||
      !Array.isArray(document.components) || !Array.isArray(document.connections) || !Array.isArray(document.failureNotes) ||
      !document.requirements.every((item) => typeof item === 'string') ||
      !document.assumptions.every((item) => typeof item === 'string') ||
      !document.failureNotes.every((item) => typeof item === 'string') ||
      !document.components.every((item) => typeof item?.id === 'string' && typeof item.label === 'string' && typeof item.kind === 'string') ||
      !document.connections.every((item) => typeof item?.from === 'string' && typeof item.to === 'string')
    ) return null;

    return { document: document as SystemDesignDocument, submittedAt: typeof parsed.submittedAt === 'string' ? parsed.submittedAt : null };
  } catch {
    return null;
  }
}

export function readLocalSystemDesignDraft(): LocalSystemDesignDraft | null {
  if (typeof window === 'undefined') return null;
  return deserializeLocalSystemDesignDraft(window.localStorage.getItem(localSystemDesignDraftKey));
}

export function writeLocalSystemDesignDraft(draft: LocalSystemDesignDraft): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(localSystemDesignDraftKey, JSON.stringify(draft));
}
