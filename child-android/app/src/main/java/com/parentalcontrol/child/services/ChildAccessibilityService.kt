package com.parentalcontrol.child.services

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.os.Build
import android.util.Base64
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

class ChildAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "ChildAccessibilityService"
        var instance: ChildAccessibilityService? = null
            private set

        fun isRunning(): Boolean = instance != null

        fun takeSilentScreenshot(callback: (String?) -> Unit) {
            val service = instance
            if (service == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                callback(null)
                return
            }

            try {
                service.takeScreenshot(
                    Display.DEFAULT_DISPLAY,
                    service.mainExecutor,
                    object : TakeScreenshotCallback {
                        override fun onSuccess(screenshotResult: ScreenshotResult) {
                            try {
                                val hardwareBuffer = screenshotResult.hardwareBuffer
                                val colorSpace = screenshotResult.colorSpace
                                val bitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, colorSpace)
                                hardwareBuffer.close()

                                if (bitmap != null) {
                                    val copy = bitmap.copy(Bitmap.Config.ARGB_8888, false)
                                    val out = ByteArrayOutputStream()
                                    copy.compress(Bitmap.CompressFormat.JPEG, 90, out)
                                    val b64 = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                                    callback(b64)
                                    return
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Bitmap conversion error", e)
                            }
                            callback(null)
                        }

                        override fun onFailure(errorCode: Int) {
                            Log.w(TAG, "Silent screenshot failure code: $errorCode")
                            callback(null)
                        }
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "takeScreenshot exception", e)
                callback(null)
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        try {
            val info = serviceInfo ?: android.accessibilityservice.AccessibilityServiceInfo()
            info.flags = info.flags or android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            serviceInfo = info
        } catch (e: Exception) {
            Log.w(TAG, "Failed to update serviceInfo: ${e.message}")
        }
        Log.i(TAG, "ChildAccessibilityService connected & ready for silent screenshots.")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // App monitoring & safety event hooks
    }

    override fun onInterrupt() {
        Log.w(TAG, "ChildAccessibilityService interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
        Log.i(TAG, "ChildAccessibilityService destroyed")
    }
}
