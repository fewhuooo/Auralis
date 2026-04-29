/**
 * ==========================================
 * 11.2 移动端专属 API 封装
 * 封装 Uni-app 原生能力：相机、震动、通知、系统信息等
 * ==========================================
 */

/**
 * 调用相机拍照，返回临时文件路径
 */
export const takePhoto = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sourceType: ['camera'],
      success: (res) => resolve(res.tempFilePaths[0]),
      fail: (err) => reject(err),
    })
  })
}

/**
 * 选择系统文件（PDF/PPT/Word 等）
 */
export const chooseFile = (count = 1): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.chooseMessageFile({
      count,
      type: 'file',
      success: (res) => resolve(res.tempFiles.map((f: any) => f.path)),
      fail: (err) => reject(err),
    })
    // #endif
    // #ifdef H5 || APP-PLUS
    uni.chooseFile?.({
      count,
      success: (res: any) => resolve(res.tempFilePaths),
      fail: (err: any) => reject(err),
    })
    // #endif
  })
}

/**
 * 轻触震动反馈 (haptic feedback)
 */
export const vibrate = (type: 'light' | 'medium' | 'heavy' = 'light') => {
  if (type === 'light') {
    uni.vibrateShort({ type: 'light' })
  } else {
    uni.vibrateLong({})
  }
}

/**
 * 发送本地通知提醒（用于番茄钟结束等场景）
 */
export const sendNotification = (title: string, content: string) => {
  // #ifdef APP-PLUS
  const notification = plus.push.createMessage(content, undefined, {
    title,
    cover: true,
  })
  console.log('[Notification] Scheduled:', notification)
  // #endif

  // #ifdef H5
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: content })
  } else if ('Notification' in window) {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body: content })
    })
  }
  // #endif
}

/**
 * 获取系统信息（屏幕宽高、平台等）
 */
export const getDeviceInfo = () => {
  const info = uni.getSystemInfoSync()
  return {
    platform: info.platform,           // android | ios | devtools
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    statusBarHeight: info.statusBarHeight || 0,
    isTablet: info.screenWidth >= 768,
    isDarkMode: info.theme === 'dark',
  }
}

/**
 * 复制文本到剪贴板（带震动反馈）
 */
export const copyToClipboard = (text: string) => {
  uni.setClipboardData({
    data: text,
    success: () => {
      vibrate('light')
      uni.showToast({ title: '已复制', icon: 'success', duration: 1000 })
    },
  })
}
