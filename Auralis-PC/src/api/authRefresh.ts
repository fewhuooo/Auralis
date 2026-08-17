export interface RefreshCoordinator {
  refresh(): Promise<string>;
}

export function createRefreshCoordinator(refreshAccessToken: () => Promise<string>): RefreshCoordinator {
  let activeRefresh: Promise<string> | null = null;

  return {
    refresh() {
      if (!activeRefresh) {
        activeRefresh = Promise.resolve()
          .then(refreshAccessToken)
          .finally(() => {
            activeRefresh = null;
          });
      }
      return activeRefresh;
    },
  };
}
