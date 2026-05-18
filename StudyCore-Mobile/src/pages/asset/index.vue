<template>
  <view class="page">
    <!-- Upload Zone -->
    <view class="upload-zone" :class="{ uploading: isUploading }" @click="chooseFile">
      <view v-if="!isUploading" class="upload-content">
        <text class="upload-icon">▤</text>
        <text class="upload-title">点击选择文件 · 或拍照扫描</text>
        <text class="upload-hint">支持 PDF / PPT / Word / 图片</text>
        <view class="upload-btns">
          <view class="up-btn" @click.stop="takePhoto"><text class="up-btn-t">⊙ 拍照</text></view>
          <view class="up-btn up-btn-primary" @click.stop="chooseFile"><text class="up-btn-t-w">🕮 选择文件</text></view>
        </view>
      </view>
      <view v-else class="upload-progress">
        <text class="prog-emoji">↻</text>
        <text class="prog-title">{{ uploadStatus }}</text>
        <view class="prog-bar-bg"><view class="prog-bar-fill" :style="{ width: uploadProgress + '%' }"></view></view>
        <text class="prog-pct">{{ uploadProgress }}%</text>
      </view>
    </view>

    <!-- History -->
    <view class="section">
      <text class="sec-title">编排历史</text>
      <view class="hist-list">
        <view v-for="item in history" :key="item.id" class="hist-card">
          <view class="hist-top">
            <text class="hist-icon">{{ item.icon }}</text>
            <view class="hist-info">
              <text class="hist-name">{{ item.name }}</text>
              <text class="hist-time">{{ item.time }}</text>
            </view>
            <view class="hist-badge" :class="'st-' + item.status">
              <text class="hist-badge-t">{{ item.statusText }}</text>
            </view>
          </view>
          <view class="hist-stats">
            <view class="hs-item"><text class="hs-v">{{ item.tasks }}</text><text class="hs-l">任务</text></view>
            <view class="hs-item"><text class="hs-v">{{ item.blocks }}</text><text class="hs-l">知识块</text></view>
            <view class="hs-item"><text class="hs-v">{{ item.pages }}</text><text class="hs-l">页</text></view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { convertHandwritingToMarkdown } from '@/api/aiClient'
import { useBlockStore } from '@/store/useBlockStore'
import { useBlockApi } from '@/api/useBlockApi'

const blockStore = useBlockStore()

const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('')

onMounted(() => {
  blockStore.fetchBlocks()
})

/**
 * 从后端 blocks 数据生成 "编排历史" 视图
 * 如果有后端数据就展示，否则 fallback 空列表
 */
const history = ref<any[]>([])

onMounted(async () => {
  try {
    const res: any = await useBlockApi.getBlocks(undefined, 1, 20)
    const blocks = res.records || []
    // 将知识块映射为资产历史条目
    if (blocks.length > 0) {
      history.value = blocks.map((b: any) => ({
        id: b.id,
        icon: b.source?.includes('手写') ? '✎' : '🕮',
        name: b.title || '未命名资产',
        time: b.time || '未知',
        status: 'done',
        statusText: '已完成',
        tasks: 0,
        blocks: 1,
        pages: 1,
      }))
    }
  } catch (e) {
    console.error('[Mobile] Failed to load asset history:', e)
  }
})

const chooseFile = () => {
  uni.chooseMessageFile?.({
    count: 1,
    type: 'file',
    success: () => simulateUpload(),
    fail: () => simulateUpload()
  })
}
const takePhoto = () => {
  uni.chooseImage({
    count: 1,
    sourceType: ['camera'],
    success: () => processHandwriting(),
    fail: () => processHandwriting() // 这里因为是模拟在PC浏览器或开发者工具点击，容易触发fail，所以也调用
  })
}

const processHandwriting = async () => {
  isUploading.value = true; uploadProgress.value = 10;
  uploadStatus.value = 'OCR 识别中...';
  
  // 模拟从手写图片中OCR出来的杂乱无章的文本
  const rawOcrText = "分布式系统... 不可能同时满足三个... 一致性、可用性、容错... 这是CAP定理... 记得本周复习Raft算法流程图...";
  
  uploadProgress.value = 50;
  uploadStatus.value = 'AI 结构化排版中...';

  try {
    const mdResult = await convertHandwritingToMarkdown(rawOcrText);
    uploadProgress.value = 90;
    uploadStatus.value = '生成知识块...';
    
    setTimeout(async () => {
      isUploading.value = false;
      const newBlock = {
        id: 'hw_' + Date.now(),
        subject: '手写笔记',
        title: '手写扫描_结构化.md',
        preview: mdResult.substring(0, 100),
        time: '刚刚',
        source: '手写扫描',
        color: 'rgba(181, 172, 159, 0.2)',
      };
      await blockStore.addBlock(newBlock);
      const newItem = {
        id: Date.now(), icon: '✎', name: '手写扫描_结构化.md', time: '刚刚',
        status: 'done', statusText: '已完成', tasks: 0, blocks: 1, pages: 1
      };
      history.value.unshift(newItem);
      uni.showToast({ title: '已转换并存入知识库', icon: 'none' });
    }, 800);

  } catch (err: any) {
    console.error("AI 处理失败，退回 Mock", err);
    uploadStatus.value = '请求失败，采用普通图片存入...';
    setTimeout(() => {
      isUploading.value = false;
      const newItem = {
        id: Date.now(), icon: '🖼', name: '手写扫描.jpg', time: '刚刚',
        status: 'done', statusText: 'Mock完成', tasks: 0, blocks: 1, pages: 1
      };
      history.value.unshift(newItem);
      uni.showToast({ title: '未配置Key或请求失败，已回退', icon: 'none' });
    }, 1000);
  }
}
const simulateUpload = () => {
  isUploading.value = true; uploadProgress.value = 0
  const steps = ['上传中...', '解析文档结构...', 'AI 语义切片...', '生成知识块...', '完成！']
  let i = 0
  const timer = setInterval(() => {
    uploadProgress.value = Math.min(100, uploadProgress.value + 5)
    uploadStatus.value = steps[Math.min(i, steps.length - 1)]
    if (uploadProgress.value % 25 === 0) i++
    if (uploadProgress.value >= 100) {
      clearInterval(timer)
      setTimeout(() => { isUploading.value = false }, 1000)
      uni.showToast({ title: '编排完成', icon: 'success' })
    }
  }, 120)
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--color-bg-primary); padding-bottom: 180rpx; }
.upload-zone { margin: 32rpx 24rpx; border: 3rpx dashed var(--border-default); border-radius: var(--radius-xl); padding: 60rpx 32rpx; background: var(--color-bg-secondary); box-shadow: var(--shadow-sm); }
.upload-zone:active { border-color: var(--border-accent); }
.upload-zone.uploading { border-style: solid; border-color: var(--border-accent); }
.upload-content { display: flex; flex-direction: column; align-items: center; }
.upload-icon { font-size: 80rpx; margin-bottom: 20rpx; color: var(--text-accent); }
.upload-title { font-size: 32rpx; font-weight: 600; color: var(--text-primary); margin-bottom: 8rpx; }
.upload-hint { font-size: 24rpx; color: var(--text-muted); margin-bottom: 32rpx; }
.upload-btns { display: flex; gap: 20rpx; }
.up-btn { padding: 16rpx 32rpx; border-radius: var(--radius-lg); background: var(--color-bg-tertiary); border: 2rpx solid var(--border-default); }
.up-btn:active { transform: scale(0.96); }
.up-btn-primary { background: var(--text-primary); border: none; }
.up-btn-t { font-size: 28rpx; font-weight: 600; color: var(--text-primary); }
.up-btn-t-w { font-size: 28rpx; font-weight: 600; color: var(--color-bg-primary); }
.upload-progress { display: flex; flex-direction: column; align-items: center; }
.prog-emoji { font-size: 64rpx; margin-bottom: 16rpx; color: var(--text-accent); display: inline-block; animation: spin 2s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }
.prog-title { font-size: 28rpx; font-weight: 600; color: var(--text-primary); margin-bottom: 20rpx; }
.prog-bar-bg { width: 100%; height: 12rpx; background: var(--color-bg-tertiary); border-radius: var(--radius-full); overflow: hidden; }
.prog-bar-fill { height: 100%; background: var(--text-primary); border-radius: var(--radius-full); transition: width 0.15s; }
.prog-pct { font-size: 24rpx; color: var(--text-muted); margin-top: 12rpx; }
.section { padding: 16rpx 24rpx; }
.sec-title { display: block; font-size: 34rpx; font-weight: 700; color: var(--text-primary); margin-bottom: 20rpx; }
.hist-list { display: flex; flex-direction: column; gap: 20rpx; }
.hist-card { background: var(--color-bg-secondary); border: 2rpx solid var(--border-subtle); border-radius: var(--radius-lg); padding: 24rpx; box-shadow: var(--shadow-sm); }
.hist-top { display: flex; align-items: center; gap: 16rpx; margin-bottom: 16rpx; }
.hist-icon { font-size: 40rpx; color: var(--text-secondary); }
.hist-info { flex: 1; }
.hist-name { display: block; font-size: 28rpx; font-weight: 600; color: var(--text-primary); }
.hist-time { display: block; font-size: 22rpx; color: var(--text-muted); margin-top: 4rpx; }
.hist-badge { padding: 4rpx 16rpx; border-radius: var(--radius-full); }
.st-done { background: var(--color-bg-tertiary); border: 1px solid var(--border-subtle); }
.st-done .hist-badge-t { font-size: 22rpx; font-weight: 600; color: var(--text-secondary); }
.st-processing { background: var(--color-bg-tertiary); border: 1px solid var(--border-subtle); }
.st-processing .hist-badge-t { font-size: 22rpx; font-weight: 600; color: var(--text-secondary); }
.hist-stats { display: flex; gap: 32rpx; }
.hs-item { display: flex; align-items: baseline; gap: 6rpx; }
.hs-v { font-size: 32rpx; font-weight: 700; color: var(--text-primary); }
.hs-l { font-size: 22rpx; color: var(--text-muted); }
</style>
