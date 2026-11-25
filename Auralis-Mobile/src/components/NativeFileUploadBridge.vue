<template>
  <view
    class="native-upload-bridge-host"
    aria-hidden="true"
    :pickCmd="pickCmd"
    :change:pickCmd="nativeUploadView.onPickCmd"
    :uploadCmd="uploadCmd"
    :change:uploadCmd="nativeUploadView.onUploadCmd"
    :releaseCmd="releaseCmd"
    :change:releaseCmd="nativeUploadView.onReleaseCmd"
  ></view>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  registerNativeUploadHost,
  type NativePickResponse,
  type NativeUploadProgress,
  type NativeUploadRegistration,
  type NativeUploadResponse,
} from '@/services/nativeUploadBridge'

interface PickCommand {
  requestId: number
  accept: string
}

interface UploadCommand {
  jobId: number
  bridgeFileId: string
  url: string
  headers: Record<string, string>
}

interface ReleaseCommand {
  seq: number
  bridgeFileId: string
}

const pickCmd = ref<PickCommand | null>(null)
const uploadCmd = ref<UploadCommand | null>(null)
const releaseCmd = ref<ReleaseCommand | null>(null)

let releaseSeq = 1
let registration: NativeUploadRegistration | null = null

onMounted(() => {
  registration = registerNativeUploadHost({
    dispatchPick(requestId, accept) {
      pickCmd.value = { requestId, accept }
    },
    dispatchUpload(jobId, bridgeFileId, url, headers) {
      uploadCmd.value = { jobId, bridgeFileId, url, headers }
    },
    dispatchRelease(bridgeFileId) {
      releaseCmd.value = { seq: releaseSeq++, bridgeFileId }
    },
  })
})

onBeforeUnmount(() => {
  registration?.dispose()
  registration = null
})

function handlePickResult(payload: NativePickResponse) {
  registration?.onPickResult(payload)
}

function handleUploadProgress(payload: NativeUploadProgress) {
  registration?.onUploadProgress(payload)
}

function handleUploadResult(payload: NativeUploadResponse) {
  registration?.onUploadResult(payload)
}

defineExpose({
  handlePickResult,
  handleUploadProgress,
  handleUploadResult,
})
</script>

<script module="nativeUploadView" lang="renderjs" src="./nativeUploadView.renderjs.js"></script>

<style scoped>
.native-upload-bridge-host {
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>
