import type { LocalDocument, LocalProgress } from '../db/local.ts';

/**
 * Select the document with highest priority for the Continue Card.
 * Prioritizes active, non-completed documents by most recent meaningful activity.
 * Completed documents are deprioritized unless no other active documents exist.
 */
export function selectContinueDocument(
  documents: LocalDocument[],
  progressMap: Record<string, LocalProgress> = {}
): LocalDocument | null {
  const activeDocs = documents.filter((d) => d.status !== 'archived');
  if (activeDocs.length === 0) return null;

  // Prioritize active non-completed documents
  const inProgressDocs = activeDocs.filter((d) => d.status !== 'completed' && !progressMap[d.id]?.completed);
  const targetList = inProgressDocs.length > 0 ? inProgressDocs : activeDocs;

  return (
    [...targetList].sort((a, b) => {
      const progA = progressMap[a.id]?.lastMeaningfulActivityAt || a.updatedAt;
      const progB = progressMap[b.id]?.lastMeaningfulActivityAt || b.updatedAt;
      return new Date(progB).getTime() - new Date(progA).getTime();
    })[0] || null
  );
}
