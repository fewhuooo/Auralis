var runtimeScriptPromises = {}

function ensureTrailingSlash(url) {
  if (!url) return '/'
  return url.charAt(url.length - 1) === '/' ? url : url + '/'
}

function loadViewerRuntime(assetBaseUrl) {
  if (typeof window !== 'undefined' && window.__AURALIS_DOC_VIEWER__) {
    return Promise.resolve(window.__AURALIS_DOC_VIEWER__)
  }
  var base = ensureTrailingSlash(assetBaseUrl)
  var scriptUrl = base + 'auralis-viewer-runtime.iife.js'
  if (runtimeScriptPromises[scriptUrl]) {
    return runtimeScriptPromises[scriptUrl]
  }
  runtimeScriptPromises[scriptUrl] = new Promise(function (resolve, reject) {
    if (typeof document === 'undefined') {
      reject(new Error('当前环境不支持文档渲染'))
      return
    }
    var script = document.createElement('script')
    script.src = scriptUrl
    script.async = true
    script.onload = function () {
      if (window.__AURALIS_DOC_VIEWER__) {
        resolve(window.__AURALIS_DOC_VIEWER__)
        return
      }
      delete runtimeScriptPromises[scriptUrl]
      reject(new Error('文档渲染引擎初始化失败'))
    }
    script.onerror = function () {
      delete runtimeScriptPromises[scriptUrl]
      reject(new Error('无法加载文档渲染引擎资源'))
    }
    document.head.appendChild(script)
  })
  return runtimeScriptPromises[scriptUrl]
}

function decodeBase64ToBuffer(rawBase64) {
  var commaIdx = rawBase64.indexOf(',')
  var payload = (commaIdx >= 0 && rawBase64.slice(0, commaIdx).indexOf(';base64') >= 0
    ? rawBase64.slice(commaIdx + 1)
    : rawBase64).replace(/\s+/g, '')
  if (!payload) return new ArrayBuffer(0)
  var binary = atob(payload)
  var bytes = new Uint8Array(binary.length)
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function readViaPlusIo(localPath) {
  return new Promise(function (resolve, reject) {
    if (typeof plus === 'undefined' || !plus.io || !plus.io.resolveLocalFileSystemURL) {
      reject(new Error('原生文件系统不可用'))
      return
    }
    plus.io.resolveLocalFileSystemURL(
      localPath,
      function (entry) {
        entry.file(
          function (fileObj) {
            var reader = new plus.io.FileReader()
            reader.onloadend = function () {
              if (reader.result instanceof ArrayBuffer) {
                resolve(reader.result)
                return
              }
              if (typeof reader.result === 'string') {
                try {
                  resolve(decodeBase64ToBuffer(reader.result))
                } catch (err) {
                  reject(err)
                }
                return
              }
              reject(new Error('无法读取本地缓存文档'))
            }
            reader.onerror = function () {
              reject(new Error('读取本地缓存文档失败'))
            }
            reader.readAsDataURL(fileObj)
          },
          function () {
            reject(new Error('打开本地缓存文档失败'))
          },
        )
      },
      function () {
        reject(new Error('找不到本地缓存文档'))
      },
    )
  })
}

function readLocalFileArrayBuffer(fileUrl, localPath, signal) {
  return new Promise(function (resolve, reject) {
    if (signal && signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    var settled = false
    var xhr = new XMLHttpRequest()
    var onAbort = function () {
      if (settled) return
      settled = true
      try {
        xhr.abort()
      } catch (_err) {
        // ignore abort error
      }
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }

    var fallbackOrReject = function (primaryErr) {
      if (!localPath) {
        reject(primaryErr)
        return
      }
      readViaPlusIo(localPath).then(resolve, function () {
        reject(primaryErr)
      })
    }

    xhr.open('GET', fileUrl, true)
    xhr.responseType = 'arraybuffer'
    xhr.onload = function () {
      if (settled) return
      settled = true
      if (signal) signal.removeEventListener('abort', onAbort)
      if ((xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) && xhr.response instanceof ArrayBuffer && xhr.response.byteLength > 0) {
        resolve(xhr.response)
        return
      }
      fallbackOrReject(new Error('读取本地文件失败 (' + xhr.status + ')'))
    }
    xhr.onerror = function () {
      if (settled) return
      settled = true
      if (signal) signal.removeEventListener('abort', onAbort)
      fallbackOrReject(new Error('读取本地文件异常'))
    }
    try {
      xhr.send()
    } catch (err) {
      if (settled) return
      settled = true
      if (signal) signal.removeEventListener('abort', onAbort)
      fallbackOrReject(err)
    }
  })
}

export default {
  data() {
    return {
      activeToken: 0,
      activeAbort: null,
      session: null,
      lastCmdSeq: 0,
    }
  },
  methods: {
    resolveSurface(surfaceId) {
      if (typeof document === 'undefined') return null
      if (surfaceId) {
        var byId = document.getElementById(surfaceId)
        if (byId) return byId
      }
      if (this.$el && typeof this.$el.querySelector === 'function') {
        return this.$el.querySelector('.doc-viewer-surface')
      }
      return null
    },
    async destroySession(reason) {
      var active = this.session
      this.session = null
      if (active) {
        await active.destroy(reason).catch(function () {})
      }
    },
    abortWork() {
      if (this.activeAbort) {
        this.activeAbort.abort()
        this.activeAbort = null
      }
    },
    async onRenderCmd(newVal, _oldVal, ownerInstance) {
      if (!newVal || !newVal.token) return
      var token = newVal.token
      this.activeToken = token
      this.abortWork()

      if (newVal.action === 'reset') {
        await this.destroySession('reset')
        return
      }
      if (newVal.action !== 'load') return

      var surface = this.resolveSurface(newVal.surfaceId)
      if (!surface) {
        ownerInstance.callMethod('handleRenderEvent', {
          token: token,
          type: 'error',
          message: '文档渲染容器未就绪',
        })
        return
      }

      var controller = typeof AbortController === 'function' ? new AbortController() : { signal: { aborted: false, addEventListener: function () {}, removeEventListener: function () {} }, abort: function () { this.signal.aborted = true } }
      this.activeAbort = controller

      try {
        await this.destroySession('replace')
        if (token !== this.activeToken || controller.signal.aborted) return

        var runtime = await loadViewerRuntime(newVal.assetBaseUrl)
        if (token !== this.activeToken || controller.signal.aborted) return

        var buffer = await readLocalFileArrayBuffer(newVal.fileUrl, newVal.localPath, controller.signal)
        if (token !== this.activeToken || controller.signal.aborted) return

        var byteLength = buffer.byteLength
        var self = this
        var nextSession = runtime.createSession({
          container: surface,
          buffer: buffer,
          fileName: newVal.fileName,
          mimeType: newVal.mimeType,
          previewKind: newVal.previewKind,
          runtimeAssetBase: ensureTrailingSlash(newVal.assetBaseUrl),
          signal: controller.signal,
          onZoomChange: function (zoom) {
            if (token !== self.activeToken) return
            ownerInstance.callMethod('handleRenderEvent', {
              token: token,
              type: 'zoom-change',
              zoom: zoom,
            })
          },
          onRotationChange: function (rotation) {
            if (token !== self.activeToken) return
            ownerInstance.callMethod('handleRenderEvent', {
              token: token,
              type: 'rotation-change',
              rotation: rotation,
            })
          },
          onPageChange: function (page, pageCount) {
            if (token !== self.activeToken) return
            ownerInstance.callMethod('handleRenderEvent', {
              token: token,
              type: 'page-change',
              page: page,
              pageCount: pageCount,
            })
          },
          onRotateFallback: function (nextRotation) {
            if (token !== self.activeToken) return
            ownerInstance.callMethod('handleRenderEvent', {
              token: token,
              type: 'rotate-fallback',
              rotation: nextRotation,
              shellWidth: surface.parentElement ? surface.parentElement.clientWidth : 0,
              shellHeight: surface.parentElement ? surface.parentElement.clientHeight : 0,
            })
          },
        })
        this.session = nextSession

        var result = await nextSession.load()
        if (token !== this.activeToken || controller.signal.aborted) return

        ownerInstance.callMethod('handleRenderEvent', {
          token: token,
          type: 'ready',
          byteLength: byteLength,
          zoom: result.zoom,
          page: result.page,
          pageCount: result.pageCount,
        })
      } catch (err) {
        if (token !== this.activeToken) return
        if (err && err.name === 'AbortError') return
        var message = err && err.message ? err.message : '文档解析渲染失败，可尝试重试或用系统阅读器打开'
        ownerInstance.callMethod('handleRenderEvent', {
          token: token,
          type: 'error',
          message: message,
        })
      } finally {
        if (this.activeAbort === controller) {
          this.activeAbort = null
        }
      }
    },
    onViewerCmd(newVal) {
      if (!newVal || !newVal.seq || newVal.seq === this.lastCmdSeq) return
      this.lastCmdSeq = newVal.seq
      if (!this.session || newVal.token !== this.activeToken) return
      if (newVal.type === 'zoomIn') void this.session.zoomIn()
      else if (newVal.type === 'zoomOut') void this.session.zoomOut()
      else if (newVal.type === 'resetZoom') void this.session.resetZoom()
      else if (newVal.type === 'rotateLeft') void this.session.rotate(-90)
      else if (newVal.type === 'rotateRight') void this.session.rotate(90)
      else if (newVal.type === 'prevPage') void this.session.prevPage()
      else if (newVal.type === 'nextPage') void this.session.nextPage()
    },
  },
  beforeUnmount() {
    this.activeToken += 1
    this.abortWork()
    void this.destroySession('component-unmount')
  },
}
