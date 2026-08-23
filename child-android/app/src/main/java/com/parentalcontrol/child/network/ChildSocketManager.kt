package com.parentalcontrol.child.network

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import com.google.gson.Gson
import com.parentalcontrol.child.services.ChildAccessibilityService
import com.parentalcontrol.child.services.ScreenCaptureManager
import com.parentalcontrol.child.webrtc.WebRtcStreamer
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

class ChildSocketManager private constructor(private val context: Context) {

    companion object {
        private const val TAG = "ChildSocketManager"
        private const val DEFAULT_BACKEND_URL = "http://10.0.2.2:4000" // Android emulator default gateway to host

        @Volatile
        private var instance: ChildSocketManager? = null

        fun getInstance(context: Context): ChildSocketManager {
            return instance ?: synchronized(this) {
                instance ?: ChildSocketManager(context.applicationContext).also { instance = it }
            }
        }
    }

    private var socket: Socket? = null
    private val gson = Gson()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var deviceId: String = "child-demo-01"
    private var backendUrl: String = DEFAULT_BACKEND_URL

    var onLockCommandReceived: ((Boolean) -> Unit)? = null
    var onScreenshotCommandReceived: (() -> Unit)? = null
    var onPolicyUpdated: ((JSONObject) -> Unit)? = null

    fun initialize(backendUrl: String, deviceId: String) {
        this.backendUrl = backendUrl
        this.deviceId = deviceId
        connect()
    }

    private fun connect() {
        try {
            socket?.disconnect()

            val opts = IO.Options().apply {
                query = "type=child&deviceId=$deviceId"
                reconnection = true
                reconnectionAttempts = Int.MAX_VALUE
                reconnectionDelay = 2000
                timeout = 10000
            }

            socket = IO.socket(backendUrl, opts)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.i(TAG, "Socket connected to backend successfully.")
                sendInitialTelemetry()
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.w(TAG, "Socket disconnected.")
            }

            // Clean any existing listeners
            socket?.off("child:command:lock")
            socket?.off("child:command:siren")
            socket?.off("child:command:message")
            socket?.off("child:command:request_location")
            socket?.off("child:command:take_screenshot")
            socket?.off("child:policy_sync")
            socket?.off("child:webrtc:start_stream")
            socket?.off("child:webrtc:stop_stream")
            socket?.off("webrtc:answer")
            socket?.off("webrtc:ice_candidate")

            // Command: Lock / Unlock device
            socket?.on("child:command:lock") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as JSONObject
                    val lock = data.optBoolean("lock", false)
                    Log.i(TAG, "Received Lock Command: $lock")
                    mainHandler.post { onLockCommandReceived?.invoke(lock) }
                }
            }

            // Command: Siren / Alarm
            var activeSiren: android.media.Ringtone? = null
            socket?.on("child:command:siren") { args ->
                val enable = if (args.isNotEmpty()) (args[0] as? JSONObject)?.optBoolean("enable", true) ?: true else true
                Log.i(TAG, "Received Siren Command: enable=$enable")
                mainHandler.post {
                    try {
                        if (enable) {
                            val uri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM)
                                ?: android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE)
                            activeSiren?.stop()
                            activeSiren = android.media.RingtoneManager.getRingtone(context, uri)
                            activeSiren?.play()
                            android.widget.Toast.makeText(context, "🔔 Lost Phone Alarm / Siren Alert Triggered!", android.widget.Toast.LENGTH_LONG).show()
                        } else {
                            activeSiren?.stop()
                            activeSiren = null
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error handling siren: ${e.message}", e)
                    }
                }
            }

            // Command: Flash Screen Message
            socket?.on("child:command:message") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val msg = data?.optString("message", "Attention!") ?: "Attention!"
                    val title = data?.optString("title", "📢 Message from Parent") ?: "📢 Message from Parent"
                    Log.i(TAG, "Received Flash Message: $msg")
                    mainHandler.post {
                        try {
                            android.widget.Toast.makeText(context, "$title\n$msg", android.widget.Toast.LENGTH_LONG).show()
                            com.parentalcontrol.child.ui.LockOverlayActivity.show(context, "$title\n\n$msg")
                        } catch (e: Exception) {
                            Log.e(TAG, "Error handling message alert: ${e.message}", e)
                        }
                    }
                }
            }

            // Command: Request Location Ping
            socket?.on("child:command:request_location") {
                Log.i(TAG, "Received Request Location Command")
                mainHandler.post {
                    try {
                        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager
                        @Suppress("MissingPermission")
                        val loc = lm?.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER)
                            ?: lm?.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER)
                        if (loc != null) {
                            sendLocation(loc.latitude, loc.longitude, loc.accuracy, "GPS Ping")
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error sending manual location ping: ${e.message}", e)
                    }
                }
            }

            // Command: Take Instant Screenshot
            socket?.on("child:command:take_screenshot") {
                Log.i(TAG, "Received Screenshot Command")
                mainHandler.post { onScreenshotCommandReceived?.invoke() }
            }

            // Policy Sync from Parent
            socket?.on("child:policy_sync") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as JSONObject
                    Log.i(TAG, "Received Policy Sync: $data")
                    mainHandler.post { onPolicyUpdated?.invoke(data) }
                }
            }

            // Screen frame streaming state
            var isStreamingScreen = false
            var screenStreamThread: Thread? = null

            // WebRTC / Live Frame Signaling: Start Stream
            socket?.on("child:webrtc:start_stream") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as JSONObject
                    val mediaType = data.optString("mediaType", "screen")
                    Log.i(TAG, "Start Stream Requested: $mediaType")

                    if (mediaType == "screen") {
                        isStreamingScreen = true
                        screenStreamThread?.interrupt()
                        screenStreamThread = Thread {
                            Log.i(TAG, "Starting silent Accessibility live screen loop...")
                            while (isStreamingScreen) {
                                try {
                                    val latch = java.util.concurrent.CountDownLatch(1)
                                    ChildAccessibilityService.takeSilentScreenshot { silentB64 ->
                                        if (silentB64 != null && silentB64.length > 1000) {
                                            val frameObj = JSONObject().apply {
                                                put("deviceId", deviceId)
                                                put("frame", silentB64)
                                            }
                                            socket?.emit("child:screen_frame", frameObj)
                                            Log.i(TAG, "Silent live screen frame streamed (${silentB64.length} chars)")
                                        } else {
                                            Log.w(TAG, "Silent live screen frame was null or throttled")
                                        }
                                        latch.countDown()
                                    }
                                    latch.await(2000, java.util.concurrent.TimeUnit.MILLISECONDS)

                                    Thread.sleep(1800)
                                } catch (e: Exception) {
                                    Log.e(TAG, "Live screen loop interrupted: ${e.message}")
                                    break
                                }
                            }
                        }.apply { start() }
                    } else {
                        WebRtcStreamer.getInstance(context).startStreaming(mediaType)
                    }
                }
            }

            // Stop Stream
            socket?.on("child:webrtc:stop_stream") {
                isStreamingScreen = false
                screenStreamThread?.interrupt()
                screenStreamThread = null
                WebRtcStreamer.getInstance(context).closeConnection()
            }

            // WebRTC Signaling: Answer from Parent
            socket?.on("webrtc:answer") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as JSONObject
                    val sdpObj = data.optJSONObject("sdp")
                    sdpObj?.let {
                        val sdp = it.optString("sdp")
                        val type = it.optString("type")
                        WebRtcStreamer.getInstance(context).onRemoteAnswerReceived(sdp, type)
                    }
                }
            }

            // WebRTC Signaling: ICE candidate from Parent
            socket?.on("webrtc:ice_candidate") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as JSONObject
                    val candObj = data.optJSONObject("candidate")
                    candObj?.let {
                        val sdpMid = it.optString("sdpMid")
                        val sdpMLineIndex = it.optInt("sdpMLineIndex", 0)
                        val sdp = it.optString("candidate")
                        WebRtcStreamer.getInstance(context).onRemoteIceCandidateReceived(sdpMid, sdpMLineIndex, sdp)
                    }
                }
            }

            socket?.connect()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect socket", e)
        }
    }

    fun sendTelemetry(batteryLevel: Int, isCharging: Boolean, activeApp: String?) {
        val payload = JSONObject().apply {
            put("deviceId", deviceId)
            put("batteryLevel", batteryLevel)
            put("isCharging", isCharging)
            put("activeApp", activeApp ?: "Unknown")
        }
        socket?.emit("child:telemetry", payload)
    }

    fun sendLocation(lat: Double, lng: Double, accuracy: Float, address: String?) {
        val payload = JSONObject().apply {
            put("deviceId", deviceId)
            put("latitude", lat)
            put("longitude", lng)
            put("accuracy", accuracy)
            put("address", address ?: "")
        }
        socket?.emit("child:location", payload)
    }

    fun sendScreenshot(base64Image: String) {
        val payload = JSONObject().apply {
            put("deviceId", deviceId)
            put("imageBase64", base64Image)
            put("triggeredBy", "manual")
        }
        socket?.emit("child:screenshot_upload", payload)
    }

    fun sendAlert(type: String, message: String, severity: String = "medium") {
        val payload = JSONObject().apply {
            put("deviceId", deviceId)
            put("type", type)
            put("message", message)
            put("severity", severity)
        }
        socket?.emit("child:alert", payload)
    }

    fun sendWebRtcOffer(sdp: String, mediaType: String) {
        val sdpObj = JSONObject().apply {
            put("type", "offer")
            put("sdp", sdp)
        }
        val payload = JSONObject().apply {
            put("deviceId", deviceId)
            put("sdp", sdpObj)
            put("mediaType", mediaType)
        }
        socket?.emit("webrtc:offer", payload)
    }

    fun sendWebRtcIceCandidate(sdpMid: String?, sdpMLineIndex: Int, candidate: String) {
        val candObj = JSONObject().apply {
            put("sdpMid", sdpMid)
            put("sdpMLineIndex", sdpMLineIndex)
            put("candidate", candidate)
        }
        val payload = JSONObject().apply {
            put("deviceId", deviceId)
            put("candidate", candObj)
        }
        socket?.emit("webrtc:ice_candidate", payload)
    }

    private fun sendInitialTelemetry() {
        val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val batteryLevel = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: 80
        sendTelemetry(batteryLevel, false, "System")
    }
}
