/** Ensures an older signed-URL download cannot replace the latest selected file. */
export class PreviewRequestGate {
  private latestRequestId = 0

  begin(): number {
    this.latestRequestId += 1
    return this.latestRequestId
  }

  isCurrent(requestId: number): boolean {
    return requestId === this.latestRequestId
  }

  invalidate(): void {
    this.latestRequestId += 1
  }
}
