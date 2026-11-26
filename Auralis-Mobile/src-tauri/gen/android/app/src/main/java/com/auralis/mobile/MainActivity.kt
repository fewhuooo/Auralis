package com.auralis.mobile

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var appWebView: WebView? = null
  private var hasPaused = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)

    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }

    val contentView = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(contentView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(contentView)

    val backCallback = object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val webView = appWebView
        if (webView == null) {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
          return
        }
        webView.evaluateJavascript(
          "(!window.dispatchEvent(new CustomEvent('auralis-android-back', { cancelable: true }))).toString()"
        ) { result ->
          if (isFinishing || isDestroyed) {
            return@evaluateJavascript
          }
          if (result == "\"true\"" || result == "true") {
            return@evaluateJavascript
          }
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
        }
      }
    }
    onBackPressedDispatcher.addCallback(this, backCallback)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.settings.useWideViewPort = true
    webView.settings.loadWithOverviewMode = true
    webView.settings.textZoom = 100
    appWebView = webView
  }

  override fun onPause() {
    hasPaused = true
    if (!isFinishing && !isDestroyed) {
      appWebView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('auralis-app-pause'));",
        null,
      )
    }
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    if (!hasPaused) {
      return
    }
    hasPaused = false
    if (!isFinishing && !isDestroyed) {
      appWebView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('auralis-app-resume'));",
        null,
      )
    }
  }

  override fun onDestroy() {
    appWebView = null
    super.onDestroy()
  }
}
