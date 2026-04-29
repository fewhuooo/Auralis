<template>
  <view class="page">
    <!-- Top Header -->
    <view class="nb-header">
      <view class="header-left" @click="goBack">
        <text class="icon-back">⟵</text>
        <text class="nb-title">操作系统原理与设计.pdf</text>
      </view>
      <view class="header-right">
        <view class="ai-toggle-btn" :class="{active: showAIPanel}" @click="showAIPanel = !showAIPanel">
          <text class="ai-stars">✦</text>
          <text class="ai-label">AI 伴读</text>
        </view>
        <text class="icon-btn">⋯</text>
      </view>
    </view>

    <view class="pdf-workspace">
      <!-- Fullscreen PDF Viewer -->
      <view class="pdf-fullscreen" :class="{'panel-open': showAIPanel}">
        <view class="pdf-toolbar">
          <text class="page-indicator">第 128 / 428 页</text>
          <view class="zoom-controls">
            <text class="z-btn">−</text>
            <text class="z-text">100%</text>
            <text class="z-btn">＋</text>
          </view>
        </view>

        <scroll-view class="pdf-canvas-wrap" scroll-y>
          <view class="pdf-page-container">
            <view class="pdf-page">
              <text class="page-title">第 5 章 进程同步与死锁</text>
              <view class="page-content">
                <text class="p-text">在多道程序环境中，系统中存在着许多并发执行的进程，它们由于共享资源或相互合作，从而导致了进程间的制约关系。为了保证系统的正确运行，必须对这种制约关系进行协调，这就是进程同步的主要任务。</text>
                
                <view class="highlight-wrapper" @click="triggerAI('详细解释死锁的定义')">
                  <text class="p-text highlighted">死锁是指两个或两个以上的进程在执行过程中，因争夺资源而造成的一种互相等待的现象，若无外力作用，它们都将无法推进下去。</text>
                  <view class="highlight-action"><text>✦ 解释</text></view>
                </view>
                
                <text class="p-text">产生死锁的四个必要条件：</text>
                <view class="p-list">
                  <text class="li">1. 互斥条件：一个资源每次只能被一个进程使用。</text>
                  <text class="li">2. 请求与保持条件：一个进程因请求资源而阻塞时，对已获得的资源保持不放。</text>
                  <text class="li">3. 不剥夺条件：进程已获得的资源，在未使用完之前，不能强行剥夺。</text>
                  <text class="li">4. 循环等待条件：若干进程之间形成一种头尾相接的循环等待资源关系。</text>
                </view>

                <view class="mock-chart">
                  <view class="circle c1">P1</view>
                  <view class="arrow">⟶</view>
                  <view class="rect">R1</view>
                  <view class="arrow">⟶</view>
                  <view class="circle c2">P2</view>
                </view>
                <text class="chart-caption">图 5-1 资源分配图示例</text>
              </view>
              <text class="page-num">- 128 -</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- Floating AI Panel -->
      <view class="floating-ai-panel" :class="{'is-visible': showAIPanel}">
        <view class="ai-panel-header">
          <text class="panel-title">Notebook Guide</text>
          <text class="close-btn" @click="showAIPanel = false">✕</text>
        </view>

        <scroll-view class="chat-scroll" scroll-y :scroll-into-view="lastMsgId">
          <!-- Notebook Guide (Initial State) -->
          <view class="notebook-guide" v-if="chatHistory.length === 0">
            <view class="guide-summary">
              <text class="summary-text">本页重点解析了“进程同步与死锁”。圈选左侧高亮段落，我可以为您详细解释死锁条件或银行家算法应用。</text>
            </view>
            
            <view class="guide-actions">
              <view class="action-card audio">
                <text class="ac-icon">⚲</text>
                <view class="ac-text">
                  <text class="ac-title">音频概览</text>
                  <text class="ac-desc">5分钟对谈</text>
                </view>
                <text class="ac-btn">▶</text>
              </view>
            </view>
          </view>

          <!-- Chat Flow -->
          <view class="chat-flow" v-else>
            <view v-for="(msg, i) in chatHistory" :key="i" :id="'msg-'+i" :class="['message', msg.role]">
              <!-- User Message -->
              <view v-if="msg.role === 'user'" class="user-bubble">
                <text>{{ msg.content }}</text>
              </view>
              
              <!-- AI Message -->
              <view v-else class="ai-block">
                <view class="ai-avatar">✦</view>
                <view class="ai-content">
                  <text class="ai-text">{{ msg.content }}</text>
                  <view v-if="msg.citations" class="citations">
                    <view class="citation-pill" v-for="c in msg.citations" :key="c.id">
                      <text class="cite-num">{{ c.id }}</text>
                      <text class="cite-src">{{ c.source }}</text>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
          
          <view class="bottom-spacer"></view>
        </scroll-view>

        <!-- Floating Input -->
        <view class="floating-input-area">
          <view class="input-pill">
            <input 
              class="nb-input" 
              v-model="inputText" 
              placeholder="输入指令..." 
              @confirm="handleSend"
            />
            <view class="send-btn" :class="{active: inputText.trim()}" @click="handleSend">
              <text class="send-icon">↗</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { vibrate } from '@/api/device'

const goBack = () => uni.navigateBack()

const showAIPanel = ref(true)

interface Citation {
  id: number
  source: string
}

interface Msg {
  role: 'user' | 'bot'
  content: string
  citations?: Citation[]
}

const chatHistory = ref<Msg[]>([])
const inputText = ref('')
const lastMsgId = ref('')

const scrollToBottom = () => {
  nextTick(() => {
    lastMsgId.value = 'msg-' + (chatHistory.value.length - 1)
  })
}

const triggerAI = (question: string) => {
  if (!showAIPanel.value) showAIPanel.value = true
  vibrate('light')
  chatHistory.value.push({ role: 'user', content: question })
  scrollToBottom()
  
  setTimeout(() => {
    chatHistory.value.push({
      role: 'bot',
      content: '死锁是指两个或多个进程在执行中，因为争夺资源而造成互相等待的现象。比如：进程A占有打印机，等待扫描仪；进程B占有扫描仪，等待打印机。双方都不肯释放自己已有的资源，导致永久阻塞。',
      citations: [
        { id: 1, source: 'P128 段落2' }
      ]
    })
    scrollToBottom()
    vibrate('light')
  }, 1000)
}

const handleSend = () => {
  if (!inputText.value.trim()) return
  vibrate('light')
  chatHistory.value.push({ role: 'user', content: inputText.value })
  inputText.value = ''
  scrollToBottom()
  
  setTimeout(() => {
    chatHistory.value.push({
      role: 'bot',
      content: '产生死锁的四个必要条件是：\n\n1. 互斥条件：资源独占\n2. 请求与保持条件：占着碗里的，看着锅里的\n3. 不剥夺条件：别人不能硬抢\n4. 循环等待条件：形成了一个互相等待的环路\n\n如果需要破解死锁，只要打破这四个条件之一即可。',
      citations: [
        { id: 2, source: 'P128 列表项' }
      ]
    })
    scrollToBottom()
    vibrate('light')
  }, 1000)
}
</script>

<style scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  overflow: hidden;
  font-family: var(--font-family-base);
}

/* Header */
.nb-header {
  height: 110rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40rpx;
  background: var(--color-bg-primary);
  border-bottom: 2rpx solid var(--border-default);
  z-index: 20;
}
.header-left { display: flex; align-items: center; gap: 24rpx; cursor: pointer; }
.icon-back { font-size: 36rpx; color: var(--text-secondary); }
.nb-title { font-size: 32rpx; font-weight: 600; color: var(--text-primary); }
.header-right { display: flex; align-items: center; gap: 32rpx; }
.icon-btn { font-size: 40rpx; color: var(--text-secondary); }

.ai-toggle-btn {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: var(--color-bg-tertiary);
  padding: 12rpx 32rpx;
  border-radius: 40rpx;
  cursor: pointer;
  transition: all 0.2s;
  border: 2rpx solid transparent;
}
.ai-toggle-btn.active {
  background: var(--color-indigo-50);
  border-color: var(--color-indigo-100);
}
.ai-stars { font-size: 28rpx; color: var(--text-accent); }
.ai-label { font-size: 28rpx; font-weight: 600; color: var(--text-accent); }

/* Workspace Layout */
.pdf-workspace {
  flex: 1;
  position: relative;
  display: flex;
  overflow: hidden;
}

/* Fullscreen PDF */
.pdf-fullscreen {
  flex: 1;
  display: flex;
  flex-direction: column;
  transition: margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--color-bg-secondary);
}

@media screen and (min-width: 768px) {
  .pdf-fullscreen.panel-open {
    margin-right: 760rpx;
  }
}

.pdf-toolbar {
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40rpx;
}
.page-indicator { font-size: 24rpx; color: var(--text-secondary); font-weight: 500; }
.zoom-controls { display: flex; align-items: center; gap: 24rpx; background: var(--color-bg-elevated); padding: 8rpx 16rpx; border-radius: 12rpx; box-shadow: var(--shadow-sm); }
.z-btn { color: var(--text-secondary); font-size: 32rpx; font-weight: bold; cursor: pointer; }
.z-text { font-size: 24rpx; color: var(--text-primary); font-weight: 600; min-width: 80rpx; text-align: center; }

.pdf-canvas-wrap {
  flex: 1;
}

.pdf-page-container {
  padding: 40rpx;
  display: flex;
  justify-content: center;
}

.pdf-page {
  background: var(--color-bg-elevated);
  border-radius: 16rpx;
  box-shadow: var(--shadow-md);
  width: 100%;
  max-width: 900px;
  min-height: 1200rpx;
  padding: 100rpx 80rpx;
  position: relative;
}

.page-title { font-size: 40rpx; font-weight: 800; color: var(--text-primary); margin-bottom: 60rpx; display: block; text-align: center; }
.p-text { font-size: 30rpx; color: var(--text-secondary); line-height: 1.8; margin-bottom: 32rpx; display: block; text-align: justify; }
.p-list { padding-left: 20rpx; margin-bottom: 32rpx; }
.li { display: block; font-size: 30rpx; color: var(--text-secondary); line-height: 1.8; margin-bottom: 12rpx; }

.highlight-wrapper { position: relative; display: inline-block; cursor: pointer; transition: all 0.2s; border-radius: 8rpx; }
.highlighted { background: rgba(181, 172, 159, 0.25); color: var(--text-primary); border-bottom: 2rpx dashed var(--color-indigo-500); padding: 4rpx 0; }
.highlight-action { position: absolute; right: -40rpx; top: -50rpx; background: var(--color-bg-primary); color: var(--text-primary); font-size: 24rpx; padding: 12rpx 24rpx; border-radius: 40rpx; opacity: 0; transform: translateY(10rpx); transition: all 0.2s; box-shadow: var(--shadow-md); white-space: nowrap; z-index: 10; font-weight: 600; border: 2rpx solid var(--border-default); }
.highlight-wrapper:hover .highlighted { background: rgba(181, 172, 159, 0.4); }
.highlight-wrapper:hover .highlight-action { opacity: 1; transform: translateY(0); }

.mock-chart { margin: 60rpx auto 20rpx; display: flex; align-items: center; justify-content: center; gap: 20rpx; padding: 60rpx; background: var(--color-bg-tertiary); border-radius: 24rpx; }
.circle { width: 100rpx; height: 100rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 4rpx solid; font-size: 32rpx; }
.c1 { border-color: var(--color-gray-400); color: var(--color-gray-600); background: var(--color-bg-secondary); }
.c2 { border-color: var(--color-purple-400); color: var(--color-purple-600); background: var(--color-bg-secondary); }
.rect { width: 100rpx; height: 100rpx; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 4rpx solid var(--color-indigo-400); color: var(--color-indigo-600); background: var(--color-bg-secondary); font-size: 32rpx; }
.arrow { font-size: 40rpx; color: var(--text-muted); }
.chart-caption { display: block; text-align: center; font-size: 26rpx; color: var(--text-muted); margin-bottom: 40rpx; font-weight: 500; }
.page-num { position: absolute; bottom: 60rpx; left: 0; right: 0; text-align: center; font-size: 26rpx; color: var(--text-muted); }

/* Floating AI Panel */
.floating-ai-panel {
  position: absolute;
  top: 32rpx;
  right: -800rpx;
  width: 720rpx;
  height: calc(100% - 64rpx);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 40rpx;
  box-shadow: var(--glass-shadow);
  border: 2rpx solid var(--glass-border);
  display: flex;
  flex-direction: column;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 100;
  overflow: hidden;
}

.floating-ai-panel.is-visible {
  transform: translateX(-832rpx);
}

@media screen and (max-width: 767px) {
  .floating-ai-panel {
    width: 100%;
    top: 0;
    height: 100%;
    border-radius: 0;
    right: -100%;
  }
  .floating-ai-panel.is-visible { transform: translateX(-100%); }
}

.ai-panel-header {
  padding: 40rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.panel-title { font-size: 36rpx; font-weight: 700; color: var(--text-primary); }
.close-btn { font-size: 36rpx; color: var(--text-muted); cursor: pointer; padding: 10rpx; }

.chat-scroll {
  flex: 1;
  position: relative;
}

.bottom-spacer { height: 200rpx; }

/* Notebook Guide */
.notebook-guide {
  padding: 0 40rpx;
}
.guide-summary { background: var(--color-bg-tertiary); padding: 32rpx; border-radius: 24rpx; margin-bottom: 32rpx; border: 2rpx solid var(--border-subtle); }
.summary-text { font-size: 28rpx; line-height: 1.6; color: var(--text-secondary); }

.guide-actions { display: flex; flex-direction: column; gap: 24rpx; }
.action-card { background: var(--color-bg-elevated); border: 2rpx solid var(--border-default); padding: 24rpx; border-radius: 24rpx; display: flex; align-items: center; gap: 20rpx; cursor: pointer; transition: all 0.2s; }
.action-card.audio { background: var(--color-indigo-50); border-color: var(--color-indigo-100); }
.ac-icon { font-size: 40rpx; color: var(--text-accent); }
.ac-text { flex: 1; display: flex; flex-direction: column; }
.ac-title { font-size: 28rpx; font-weight: 600; color: var(--text-primary); }
.ac-desc { font-size: 24rpx; color: var(--text-muted); margin-top: 4rpx; }
.ac-btn { width: 56rpx; height: 56rpx; background: var(--text-accent); color: var(--color-bg-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20rpx; padding-left: 4rpx; }

/* Chat Flow */
.chat-flow {
  padding: 0 40rpx;
}
.message { display: flex; margin-bottom: 40rpx; flex-direction: column; }

.user-bubble { 
  background: var(--color-bg-tertiary); 
  padding: 24rpx 32rpx; 
  border-radius: 24rpx; 
  align-self: flex-end;
  max-width: 85%;
  border-bottom-right-radius: 8rpx;
}
.user-bubble text { font-size: 28rpx; color: var(--text-primary); line-height: 1.5; }

.ai-block { display: flex; align-items: flex-start; gap: 20rpx; max-width: 95%; }
.ai-avatar { width: 56rpx; height: 56rpx; border-radius: 50%; background: var(--accent-gradient); display: flex; align-items: center; justify-content: center; color: var(--color-bg-primary); font-size: 28rpx; flex-shrink: 0; }
.ai-content { flex: 1; }
.ai-text { font-size: 28rpx; color: var(--text-primary); line-height: 1.6; display: block; }

.citations { display: flex; gap: 12rpx; flex-wrap: wrap; margin-top: 16rpx; }
.citation-pill { display: flex; align-items: center; background: var(--color-bg-tertiary); border: 2rpx solid var(--border-subtle); padding: 4rpx 12rpx 4rpx 4rpx; border-radius: 32rpx; cursor: pointer; }
.cite-num { width: 32rpx; height: 32rpx; background: var(--color-bg-elevated); color: var(--text-secondary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20rpx; font-weight: bold; margin-right: 8rpx; }
.cite-src { font-size: 22rpx; color: var(--text-secondary); }

/* Floating Input */
.floating-input-area {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 32rpx 40rpx;
  background: linear-gradient(to top, var(--color-bg-elevated) 70%, transparent);
  box-sizing: border-box;
}

.input-pill {
  width: 100%;
  background: var(--color-bg-primary);
  border: 2rpx solid var(--border-default);
  border-radius: 60rpx;
  display: flex;
  align-items: center;
  padding: 8rpx 8rpx 8rpx 32rpx;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s;
}
.input-pill:focus-within { border-color: var(--border-accent); box-shadow: var(--shadow-md); }

.nb-input {
  flex: 1;
  height: 72rpx;
  font-size: 28rpx;
  color: var(--text-primary);
  background: transparent;
}

.send-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 16rpx;
  transition: all 0.2s;
}
.send-btn.active { background: var(--text-accent); }
.send-icon { font-size: 32rpx; font-weight: bold; color: var(--text-muted); }
.send-btn.active .send-icon { color: var(--color-bg-primary); }
</style>
