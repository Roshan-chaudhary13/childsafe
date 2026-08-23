package com.parentalcontrol.child.ui

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.parentalcontrol.child.R
import com.parentalcontrol.child.network.ChildSocketManager
import com.parentalcontrol.child.services.ScreenCaptureManager

class StatusActivity : AppCompatActivity() {

    private lateinit var btnFixAccessibility: Button
    private lateinit var btnCamouflage: Button
    private lateinit var btnHideApp: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_status)

        val tvStatus = findViewById<TextView>(R.id.tvStatus)
        val tvDeviceInfo = findViewById<TextView>(R.id.tvDeviceInfo)
        val btnSos = findViewById<Button>(R.id.btnSos)
        btnFixAccessibility = findViewById(R.id.btnFixAccessibility)
        btnCamouflage = findViewById(R.id.btnCamouflage)
        btnHideApp = findViewById(R.id.btnHideApp)

        val prefs = getSharedPreferences("parental_prefs", Context.MODE_PRIVATE)
        val deviceId = prefs.getString("device_id", "child-demo-01")

        // Ensure Foreground Safety Service is running
        com.parentalcontrol.child.services.ForegroundSafetyService.start(this)

        tvDeviceInfo.text = "Device ID: $deviceId\nProtected by Family Shield"
        tvStatus.text = "🛡️ Protection Active\nLocation, Screen Time & Monitoring enabled"

        btnFixAccessibility.setOnClickListener {
            startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS))
            Toast.makeText(this, "Turn ON 'Child Safety Shield' in Accessibility", Toast.LENGTH_LONG).show()
        }

        btnCamouflage.setOnClickListener {
            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("🎭 Enable Camouflage Disguise?")
                .setMessage("The app icon will morph into 'System Service' with a system gear icon.\n\nTo re-open this parent screen later: Open 'System Service' and tap the version number at bottom 5 times.")
                .setPositiveButton("Enable Camouflage") { _, _ ->
                    com.parentalcontrol.child.utils.StealthManager.setMode(this, com.parentalcontrol.child.utils.StealthManager.StealthMode.CAMOUFLAGE)
                    Toast.makeText(this, "Disguised as 'System Service' ⚙️", Toast.LENGTH_LONG).show()
                    finishAndRemoveTask()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        btnHideApp.setOnClickListener {
            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("🕶️ Enter Total Stealth Mode?")
                .setMessage("This will completely remove the icon from the Home Screen and App Drawer.\n\nThe safety service will continue running 24/7 in the background.")
                .setPositiveButton("Hide Completely") { _, _ ->
                    com.parentalcontrol.child.utils.StealthManager.setMode(this, com.parentalcontrol.child.utils.StealthManager.StealthMode.HIDDEN)
                    Toast.makeText(this, "App icon hidden! Protection active in background 🛡️", Toast.LENGTH_LONG).show()
                    finishAndRemoveTask()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        btnSos.setOnClickListener {
            ChildSocketManager.getInstance(this).sendAlert(
                "GEOFENCE_EXIT",
                "🚨 SOS Emergency button triggered by child!",
                "high"
            )
            Toast.makeText(this, "SOS Emergency alert sent to parents!", Toast.LENGTH_LONG).show()
        }
    }

    override fun onResume() {
        super.onResume()
        updateAccessibilityWarning()
    }

    private fun updateAccessibilityWarning() {
        val isA11yRunning = com.parentalcontrol.child.services.ChildAccessibilityService.isRunning()
        if (isA11yRunning) {
            btnFixAccessibility.visibility = android.view.View.GONE
        } else {
            btnFixAccessibility.visibility = android.view.View.VISIBLE
        }
    }
}
