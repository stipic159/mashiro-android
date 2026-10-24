package app.mashiro.client

import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private lateinit var mediaPlugin: MediaPlugin

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    mediaPlugin = MediaPlugin(this)
    getPluginManager().load(null, "media", mediaPlugin, "{}")

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (MediaPlugin.handleBackPress()) {
          return
        }
        isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        isEnabled = true
      }
    })
  }

  override fun onWebViewCreate(webView: android.webkit.WebView) {
    super.onWebViewCreate(webView)
    webView.settings.mediaPlaybackRequiresUserGesture = false
  }
}
