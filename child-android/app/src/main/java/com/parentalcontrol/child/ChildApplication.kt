package com.parentalcontrol.child

import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

class ChildApplication : Application() {

    companion object {
        const val CHANNEL_SAFETY_SERVICE = "channel_safety_service"
        const val CHANNEL_ALERTS = "channel_safety_alerts"
        lateinit var instance: ChildApplication
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val safetyChannel = NotificationChannel(
                CHANNEL_SAFETY_SERVICE,
                "System Services",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Background system sync services"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
                enableLights(false)
                enableVibration(false)
            }

            val alertsChannel = NotificationChannel(
                CHANNEL_ALERTS,
                "System Notifications",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "System notifications"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
                enableLights(false)
                enableVibration(false)
            }

            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(safetyChannel)
            manager.createNotificationChannel(alertsChannel)
        }
    }
}
