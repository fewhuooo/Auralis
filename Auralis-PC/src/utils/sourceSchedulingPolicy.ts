export interface AwaitingClientDocumentCandidate {
  ingestionStatus?: string
  assetId?: string
  ingestionRevision?: string
}

export function shouldScheduleAwaitingClientDocument(
  model: AwaitingClientDocumentCandidate,
): boolean {
  return model.ingestionStatus === 'AWAITING_CLIENT'
    && Boolean(model.assetId?.trim())
    && Boolean(model.ingestionRevision?.trim())
}
