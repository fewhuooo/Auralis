export default {
  data() {
    return {
      fileMap: new Map(),
      activeInput: null,
      focusHandler: null,
      focusTimer: null,
      activeXhrs: new Map(),
    }
  },
  methods: {
    cleanupActivePick() {
      if (this.focusTimer) {
        clearTimeout(this.focusTimer)
        this.focusTimer = null
      }
      if (this.focusHandler && typeof window !== 'undefined') {
        window.removeEventListener('focus', this.focusHandler)
        this.focusHandler = null
      }
      if (this.activeInput && this.activeInput.parentNode) {
        this.activeInput.parentNode.removeChild(this.activeInput)
      }
      this.activeInput = null
    },
    onPickCmd(newVal, _oldVal, ownerInstance) {
      if (!newVal || !newVal.requestId || typeof document === 'undefined') return
      this.cleanupActivePick()

      var requestId = newVal.requestId
      var settled = false
      var self = this

      var settle = function (payload) {
        if (settled) return
        settled = true
        self.cleanupActivePick()
        ownerInstance.callMethod('handlePickResult', payload)
      }

      var input = document.createElement('input')
      input.type = 'file'
      if (newVal.accept) {
        input.accept = newVal.accept
      }
      input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;width:1px;height:1px;'
      this.activeInput = input
      document.body.appendChild(input)

      input.addEventListener('change', function () {
        var file = input.files && input.files[0] ? input.files[0] : null
        if (!file) {
          settle({ requestId: requestId, cancelled: true })
          return
        }
        var bridgeFileId = 'nb_' + requestId + '_' + Date.now()
        self.fileMap.set(bridgeFileId, file)
        settle({
          requestId: requestId,
          cancelled: false,
          file: {
            bridgeFileId: bridgeFileId,
            name: file.name || ('file-' + Date.now()),
            size: Number(file.size || 0),
            type: file.type || '',
          },
        })
      })

      input.addEventListener('cancel', function () {
        settle({ requestId: requestId, cancelled: true })
      })

      this.focusHandler = function () {
        self.focusTimer = setTimeout(function () {
          settle({ requestId: requestId, cancelled: true })
        }, 450)
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', this.focusHandler)
      }

      try {
        input.click()
      } catch (err) {
        settle({
          requestId: requestId,
          cancelled: false,
          error: err && err.message ? err.message : '无法打开系统文件选择器',
        })
      }
    },
    onUploadCmd(newVal, _oldVal, ownerInstance) {
      if (!newVal || !newVal.jobId) return
      var jobId = newVal.jobId
      var file = this.fileMap.get(newVal.bridgeFileId)
      if (!file) {
        ownerInstance.callMethod('handleUploadResult', {
          jobId: jobId,
          ok: false,
          error: '所选文件已失效，请重新选择',
        })
        return
      }

      var self = this
      var xhr = new XMLHttpRequest()
      this.activeXhrs.set(jobId, xhr)
      xhr.open('PUT', newVal.url, true)
      xhr.timeout = 300000

      var headers = newVal.headers || {}
      var keys = Object.keys(headers)
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i]
        if (key.toLowerCase() === 'content-length') continue
        xhr.setRequestHeader(key, headers[key])
      }

      xhr.upload.onprogress = function (event) {
        var total = event.lengthComputable && event.total > 0 ? event.total : Number(file.size || 0)
        if (total <= 0) return
        ownerInstance.callMethod('handleUploadProgress', {
          jobId: jobId,
          loaded: Number(event.loaded || 0),
          total: total,
        })
      }

      var finish = function (ok, error) {
        self.activeXhrs.delete(jobId)
        ownerInstance.callMethod('handleUploadResult', {
          jobId: jobId,
          ok: ok,
          error: error,
        })
      }

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          finish(true)
          return
        }
        finish(false, '文件上传失败 (' + xhr.status + ')')
      }
      xhr.ontimeout = function () {
        finish(false, '文件上传超时，请检查网络后重试')
      }
      xhr.onerror = function () {
        finish(false, '文件上传网络异常')
      }
      xhr.onabort = function () {
        finish(false, '文件上传已取消')
      }

      try {
        xhr.send(file)
      } catch (err) {
        finish(false, err && err.message ? err.message : '发送文件失败')
      }
    },
    onReleaseCmd(newVal) {
      if (!newVal || !newVal.bridgeFileId) return
      this.fileMap.delete(newVal.bridgeFileId)
    },
  },
  beforeUnmount() {
    this.cleanupActivePick()
    this.activeXhrs.forEach(function (xhr) {
      try {
        xhr.abort()
      } catch (_err) {
        // ignore abort error
      }
    })
    this.activeXhrs.clear()
    this.fileMap.clear()
  },
}
