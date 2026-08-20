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
import { useBlockStore } from '@/store/useBlockStore'
import { uploadAsset } from '@/services/assetUpload'

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
    await blockStore.loadLocalBlocks()
    const blocks = blockStore.recentBlocks || []
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
    success: (result: any) => {
      const file = result.tempFiles?.[0]
      if (file) void handleSelectedFile({
        path: file.path,
        name: file.name || 'document',
        size: Number(file.size || 0),
        mimeType: file.type || 'application/octet-stream',
      })
    },
  })
}
const takePhoto = () => {
  uni.chooseImage({
    count: 1,
    sourceType: ['camera'],
    success: (result: any) => {
      const file = result.tempFiles?.[0]
      const path = file?.path || result.tempFilePaths?.[0]
      if (path) void handleSelectedFile({
        path,
        name: `scan-${Date.now()}.jpg`,
        size: Number(file?.size || 0),
        mimeType: 'image/jpeg',
      })
    },
  })
}

const handleSelectedFile = async (file: { path: string; name: string; size: number; mimeType: string }) => {
  isUploading.value = true
  uploadProgress.value = 15
  uploadStatus.value = '创建上传凭证...'
  try {
    uploadProgress.value = 45
    uploadStatus.value = '上传文件...'
    const assetId = await uploadAsset(file)
    uploadProgress.value = 100
    uploadStatus.value = '上传完成'
    history.value.unshift({
      id: assetId,
      icon: file.mimeType.startsWith('image/') ? '✎' : '🕮',
      name: file.name,
      time: '刚刚',
      status: 'done',
      statusText: '已上传',
      tasks: 0,
      blocks: 0,
      pages: 0,
    })
    uni.showToast({ title: '文件上传完成', icon: 'success' })
  } catch (error) {
    console.error('[Asset] Upload failed:', error)
    uni.showToast({ title: '文件上传失败', icon: 'none' })
  } finally {
    isUploading.value = false
  }
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
