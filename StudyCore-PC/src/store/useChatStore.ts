import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { localDb } from '@/services/localDb'
import { uuidv7 } from '@/utils/uuid'
import { useSubjectStore } from './useSubjectStore'

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const activeSessionId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)

  const activeSubjectId = computed(() => {
    return useSubjectStore().activeSubjectId
  })

  const mapSession = (row: any): ChatSession => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at || row.createdAt || Date.now(),
    updatedAt: row.updated_at || row.updatedAt || Date.now()
  })

  const mapMessage = (row: any): ChatMessage => ({
    id: row.id,
    sessionId: row.session_id || row.sessionId,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    createdAt: row.created_at || row.createdAt || Date.now()
  })

  const loadSessions = async () => {
    try {
      const rows = await localDb.getChatSessions(50)
      sessions.value = rows.map(mapSession)
    } catch (e) {
      console.error('Failed to load chat sessions:', e)
    }
  }

  const loadMessages = async (sessionId: string) => {
    try {
      activeSessionId.value = sessionId
      const rows = await localDb.getChatMessages(sessionId)
      messages.value = rows.map(mapMessage)
    } catch (e) {
      console.error('Failed to load chat messages:', e)
    }
  }

  const startNewSession = async (userInput: string): Promise<string> => {
    const sessionId = uuidv7()
    const title = userInput.trim().slice(0, 30) || '新会话'
    
    try {
      await localDb.createChatSession(sessionId, title)
      activeSessionId.value = sessionId
      messages.value = []
      await loadSessions()
    } catch (e) {
      console.error('Failed to start new chat session:', e)
    }
    
    return sessionId
  }

  const appendUserMessage = async (content: string): Promise<string> => {
    const msgId = uuidv7()
    const sessionId = activeSessionId.value
    if (!sessionId) {
      throw new Error('No active chat session')
    }

    const newMessage: ChatMessage = {
      id: msgId,
      sessionId,
      role: 'user',
      content,
      createdAt: Date.now()
    }

    messages.value.push(newMessage)

    try {
      await localDb.appendChatMessage(msgId, sessionId, 'user', content)
      await loadSessions() // Refresh updated_at
    } catch (e) {
      console.error('Failed to save user message:', e)
    }

    return msgId
  }

  const appendAssistantChunk = (chunk: string) => {
    const sessionId = activeSessionId.value
    if (!sessionId) return

    isStreaming.value = true

    if (messages.value.length === 0 || messages.value[messages.value.length - 1].role !== 'assistant') {
      const newMsg: ChatMessage = {
        id: uuidv7(),
        sessionId,
        role: 'assistant',
        content: chunk,
        createdAt: Date.now()
      }
      messages.value.push(newMsg)
    } else {
      messages.value[messages.value.length - 1].content += chunk
    }
  }

  const finalizeAssistantMessage = async () => {
    const sessionId = activeSessionId.value
    if (!sessionId) return

    isStreaming.value = false
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      try {
        await localDb.appendChatMessage(lastMsg.id, sessionId, 'assistant', lastMsg.content)
        await loadSessions()
      } catch (e) {
        console.error('Failed to save assistant message:', e)
      }
    }
  }

  const deleteSession = async (sessionId: string) => {
    try {
      await localDb.deleteChatSession(sessionId)
      if (activeSessionId.value === sessionId) {
        activeSessionId.value = null
        messages.value = []
      }
      await loadSessions()
    } catch (e) {
      console.error('Failed to delete chat session:', e)
    }
  }

  return {
    sessions,
    activeSessionId,
    activeSubjectId,
    messages,
    isStreaming,
    loadSessions,
    loadMessages,
    startNewSession,
    appendUserMessage,
    appendAssistantChunk,
    finalizeAssistantMessage,
    deleteSession
  }
})
