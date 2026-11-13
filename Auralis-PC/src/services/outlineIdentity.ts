export function shouldAdoptGeneratedOutline(
  previousGeneratedAt: string | null | undefined,
  nextGeneratedAt: string | null,
  hasUnsavedDraftChanges: boolean,
): boolean {
  return previousGeneratedAt !== undefined && previousGeneratedAt !== nextGeneratedAt && !hasUnsavedDraftChanges
}
