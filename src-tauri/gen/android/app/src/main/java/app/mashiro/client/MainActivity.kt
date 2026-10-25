package app.mashiro.client

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {

  private val requestPermissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
  ) { _: Boolean ->
    // Permission status handled by the system
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    checkNotificationPermission()

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

  private fun checkNotificationPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
        requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
      }
    }
  }

  override fun onWebViewCreate(webView: android.webkit.WebView) {
    super.onWebViewCreate(webView)
    webView.settings.mediaPlaybackRequiresUserGesture = false
  }
}
