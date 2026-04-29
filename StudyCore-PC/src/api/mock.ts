/**
 * ==========================================
 * 8.1 编写 Mock 数据脚本
 * 为应用提供更丰富的本地测试数据，模拟真实的后端响应
 * ==========================================
 */

export const mockApi = {
  // 模拟网络延迟
  delay: (ms = 500) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * 模拟获取知识块列表 (用于 Home 页)
   */
  async fetchKnowledgeBlocks() {
    await this.delay(600);
    return [
      { id: 'mock-1', subject: 'Rust 语言', title: '所有权机制详解', preview: 'Rust 的所有权系统保证了内存安全，无垃圾回收...', time: '刚刚', source: '桌面端采集', color: '#f97316' },
      { id: 'mock-2', subject: '人工智能', title: 'Transformer 架构中的 QKV 注意力机制', preview: 'Query, Key, Value 是自注意力机制的核心计算要素...', time: '1小时前', source: '文献解析', color: '#3b82f6' },
      { id: 'mock-3', subject: '操作系统', title: '死锁的四个必要条件', preview: '互斥、请求与保持、不剥夺、循环等待...', time: '3小时前', source: '手机速记', color: '#a855f7' },
      { id: 'mock-4', subject: '产品思考', title: 'StudyCore 交互演进', preview: '卡片式交互比传统的列表视图具备更高的认知效率...', time: '昨天', source: '灵感闪现', color: '#ec4899' },
    ];
  },

  /**
   * 模拟获取任务列表 (用于 Timeline 页)
   */
  async fetchPendingTasks() {
    await this.delay(400);
    return [
      { id: 't-101', name: '复盘 Vue3 渲染机制', subject: '前端框架', duration: 45, color: '#10b981', load: 'medium', loadText: '中', status: 'pending' },
      { id: 't-102', name: '阅读 CSAPP 第五章', subject: '底层体系', duration: 90, color: '#ef4444', load: 'high', loadText: '高', status: 'pending' },
      { id: 't-103', name: '整理本周英文单词', subject: '语言学习', duration: 20, color: '#6366f1', load: 'low', loadText: '低', status: 'pending' },
      { id: 't-104', name: '完成 Tauri IPC 预研', subject: '项目开发', duration: 60, color: '#f59e0b', load: 'medium', loadText: '中', status: 'pending' },
    ];
  },

  /**
   * 模拟发送 RAG 问答请求 (用于 Home 页顶部栏)
   */
  async ragQuery(query: string) {
    await this.delay(1200); // RAG 通常比较慢
    return {
      answer: `这是关于 "${query}" 的 AI 综合解答。根据您个人知识库中的 3 篇相关笔记，该问题的核心可以概括为...`,
      sources: ['Rust 语言所有权机制', '后端架构笔记'],
      newBlockGenerated: true
    };
  }
};
