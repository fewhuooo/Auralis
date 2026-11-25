import '@vue/runtime-core'

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    readonly nativeUploadView: {
      readonly onPickCmd: unknown
      readonly onUploadCmd: unknown
      readonly onReleaseCmd: unknown
    }
    readonly appDocViewer: {
      readonly onRenderCmd: unknown
      readonly onViewerCmd: unknown
    }
  }
}
