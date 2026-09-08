const SOURCE_PHASE_LABELS: Record<string, string> = {
  AWAITING_CLIENT: '等待桌面端处理',
  VALIDATING: '服务端校验',
  PENDING: '服务端排队',
  PARSING: '服务端解析',
  INDEXING: '服务端建立索引',
  FAILED: '服务端失败',
  READY: '处理完成',
}

const SOURCE_DETAIL_LABELS: Record<string, string> = {
  AWAITING_CLIENT: '等待桌面端开始处理',
  VALIDATING: '服务端正在校验解析结果',
  PENDING: '等待服务端开始处理',
  PARSING: '服务端正在解析文件',
  INDEXING: '服务端正在建立索引',
  FAILED: '服务端处理失败',
  READY: '处理完成',
}

export function sourcePhaseLabel(phase: string | undefined): string {
  return SOURCE_PHASE_LABELS[phase || ''] || '等待状态同步'
}

export function sourceDetailLabel(phase: string | undefined): string {
  return SOURCE_DETAIL_LABELS[phase || ''] || '处理状态尚未同步，请稍后刷新'
}
