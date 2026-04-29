/**
 * useBlockStore — 移动端知识块状态管理
 * 复用 PC 端同名 Store 的数据模型和核心逻辑
 * 持久化由 uni-storage persist 插件自动处理
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface KnowledgeBlock {
  id: string
  subject: string
  title: string
  preview: string
  time: string
  source: string
  color: string
}

export const useBlockStore = defineStore('block', () => {
  const recentBlocks = ref<KnowledgeBlock[]>([
    {
      id: 'b1',
      subject: '操作系统',
      title: '进程与线程的核心区别',
      preview: '进程是操作系统资源分配的基本单位，拥有独立的地址空间；线程是CPU调度的基本单位...',
      time: '2小时前',
      source: '手机问答',
      color: 'rgba(99, 102, 241, 0.2)',
    },
    {
      id: 'b2',
      subject: '数据结构',
      title: '红黑树的旋转操作',
      preview: '左旋和右旋是红黑树维持平衡性质的核心操作...',
      time: '昨天',
      source: 'PDF 导入',
      color: 'rgba(236, 72, 153, 0.2)',
    },
    {
      id: 'b3',
      subject: 'Spring Boot',
      title: 'IoC 容器初始化流程',
      preview: 'Spring IoC容器通过BeanDefinition描述Bean的配置信息...',
      time: '3天前',
      source: 'AI 生成',
      color: 'rgba(16, 185, 129, 0.2)',
    },
  ])

  const addBlock = (block: KnowledgeBlock) => {
    recentBlocks.value.unshift(block)
  }

  const removeBlock = (id: string) => {
    recentBlocks.value = recentBlocks.value.filter(b => b.id !== id)
  }

  /**
   * 从远程同步数据覆盖本地（PC端 -> 移动端）
   */
  const syncFromRemote = (blocks: KnowledgeBlock[]) => {
    recentBlocks.value = blocks
  }

  return {
    recentBlocks,
    addBlock,
    removeBlock,
    syncFromRemote,
  }
}, {
  persist: true
})
