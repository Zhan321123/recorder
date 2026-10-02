package com.recorder.app

import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // 本机补丁：edge-to-edge 被强制开启（targetSdk 35+），而前端 env(safe-area-inset-*)
    // 在部分 ROM/老 WebView 上不可靠（vivo S9 实测 bottom 恒 0，FAB 被导航键遮挡）。
    // 在 WebView 上消费 insets：状态栏/导航栏/键盘高度转成 WebView 的 margin，
    // 视口永远夹在安全区内，键盘遮挡问题一并解决（adjustResize 只是辅助）。
    // 返回 CONSUMED 后前端 env() 全为 0，CSS 里的 env() padding 自动失效，不会双重 padding。
    val content = findViewById<ViewGroup>(android.R.id.content)
    content.post {
      val webview = content.getChildAt(0) ?: return@post
      ViewCompat.setOnApplyWindowInsetsListener(webview) { v, insets ->
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
        Log.d("recorder", "insets: top=${bars.top} bottom=${bars.bottom} ime=${ime.bottom}")
        v.updateLayoutParams<ViewGroup.MarginLayoutParams> {
          topMargin = bars.top
          bottomMargin = maxOf(bars.bottom, ime.bottom)
          leftMargin = bars.left
          rightMargin = bars.right
        }
        WindowInsetsCompat.CONSUMED
      }
      ViewCompat.requestApplyInsets(webview)
    }
  }
}
