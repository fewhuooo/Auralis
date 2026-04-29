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
      title: '进程与线程的区别',
      preview: '进程是资源分配的基本单位，线程是 CPU 调度的基本单位...',
      time: '2 小时前',
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
      title: 'IoC 容器与依赖注入',
      preview: 'Spring 的 IoC 容器通过反射机制管理 Bean 的生命周期...',
      time: '3 天前',
      source: '手机问答',
      color: 'rgba(34, 197, 94, 0.2)',
    },
  ])

  const addBlock = (block: KnowledgeBlock) => {
    recentBlocks.value.unshift(block)
  }

  const removeBlock = (id: string) => {
    recentBlocks.value = recentBlocks.value.filter(b => b.id !== id)
  }

  return {
    recentBlocks,
    addBlock,
    removeBlock
  }
}, {
  persist: true
})
