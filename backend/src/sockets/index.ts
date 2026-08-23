import { Server, Socket } from 'socket.io';
import { store } from '../store/index.js';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';

export function setupSockets(io: Server) {
  io.on('connection', (socket: Socket) => {
    const query = socket.handshake.query;
    const clientType = query.type as 'parent' | 'child';
    let deviceId = query.deviceId as string;

    if (deviceId) {
      const matched = store.getDeviceById(deviceId);
      if (matched) {
        deviceId = matched.id;
      }
    }

    console.log(`[Socket Connected] SocketID: ${socket.id}, Type: ${clientType}, DeviceID: ${deviceId || 'N/A'}`);

    if (deviceId) {
      // Join device-specific room
      socket.join(`device:${deviceId}`);
      
      if (clientType === 'child') {
        socket.join(`child:${deviceId}`);
        store.updateDevice(deviceId, { status: 'online', isPaired: true, lastSeen: new Date().toISOString() });
        io.to(`device:${deviceId}`).emit('device:status', { deviceId, status: 'online' });
        io.to(`parent:${deviceId}`).emit('device:status', { deviceId, status: 'online' });
      } else if (clientType === 'parent') {
        socket.join(`parent:${deviceId}`);
      }
    }

    // 1. Child Telemetry & Health Updates
    socket.on('child:telemetry', (data: { deviceId: string; batteryLevel: number; isCharging: boolean; activeApp?: string }) => {
      const targetId = store.getDeviceById(data.deviceId)?.id || data.deviceId;
      store.updateDevice(targetId, {
        batteryLevel: data.batteryLevel,
        isCharging: data.isCharging,
        lastSeen: new Date().toISOString(),
        status: 'online'
      });
      // Forward to parent dashboard
      io.to(`parent:${targetId}`).emit('parent:telemetry_update', { ...data, deviceId: targetId });
      io.to(`parent:${data.deviceId}`).emit('parent:telemetry_update', { ...data, deviceId: targetId });
    });

    // 2. Child Location Ping
    socket.on('child:location', (data: { deviceId: string; latitude: number; longitude: number; accuracy: number; address?: string }) => {
      const targetId = store.getDeviceById(data.deviceId)?.id || data.deviceId;
      const locPoint = {
        id: uuidv4(),
        deviceId: targetId,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy || 10,
        timestamp: new Date().toISOString(),
        address: data.address
      };
      store.addLocation(locPoint);
      io.to(`parent:${targetId}`).emit('parent:location_update', locPoint);
      io.to(`parent:${data.deviceId}`).emit('parent:location_update', locPoint);
    });

    // 3. Child App Usage Sync
    socket.on('child:usage_sync', (data: { deviceId: string; usages: any[] }) => {
      const targetId = store.getDeviceById(data.deviceId)?.id || data.deviceId;
      store.updateAppUsage(targetId, data.usages);
      io.to(`parent:${targetId}`).emit('parent:usage_update', data.usages);
    });

    // 4. Remote Screenshot Delivery
    socket.on('child:screenshot_upload', (data: { deviceId: string; imageBase64: string; triggeredBy?: 'manual' | 'schedule' }) => {
      const targetId = store.getDeviceById(data.deviceId)?.id || data.deviceId;
      console.log(`[Screenshot Received] from child device: ${data.deviceId} -> target: ${targetId}`);
      const shot = {
        id: uuidv4(),
        deviceId: targetId,
        imageUrl: data.imageBase64,
        timestamp: new Date().toISOString(),
        triggeredBy: data.triggeredBy || 'manual'
      };
      store.addScreenshot(shot);
      io.emit('parent:screenshot_received', shot);
    });

    // 4b. Real-time Screen Frame Stream from Child App
    socket.on('child:screen_frame', (data: { deviceId: string; frame: string }) => {
      const targetId = store.getDeviceById(data.deviceId)?.id || data.deviceId;
      const payload = {
        deviceId: targetId,
        frame: data.frame,
        timestamp: Date.now()
      };
      io.emit('parent:screen_frame', payload);
    });

    // 5. Child Safety Alerts (e.g. Blocked site hit, tamper detected)
    socket.on('child:alert', (data: { deviceId: string; type: any; message: string; severity: any; metadata?: any }) => {
      const targetId = store.getDeviceById(data.deviceId)?.id || data.deviceId;
      const alert = {
        id: uuidv4(),
        deviceId: targetId,
        type: data.type,
        message: data.message,
        severity: data.severity || 'medium',
        timestamp: new Date().toISOString(),
        metadata: data.metadata
      };
      store.addAlert(alert);
      io.emit('parent:new_alert', alert);
    });

    // ==========================================
    // PARENT COMMANDS TO CHILD
    // ==========================================

    // Helper to send to child device
    const emitToChild = (targetDevId: string, event: string, payload?: any) => {
      const dev = store.getDeviceById(targetDevId);
      const childRoom = dev ? `child:${dev.id}` : `child:${targetDevId}`;
      io.to(childRoom).emit(event, payload);
    };

    // Command: Lock / Unlock device
    socket.on('parent:command:lock', (data: { deviceId: string; lock: boolean }) => {
      store.updateDevice(data.deviceId, { isLocked: data.lock });
      store.updateScreenTimePolicy(data.deviceId, { isLocked: data.lock });
      emitToChild(data.deviceId, 'child:command:lock', { lock: data.lock });
      io.to(`parent:${data.deviceId}`).emit('parent:lock_state_changed', { deviceId: data.deviceId, isLocked: data.lock });
    });

    // Command: Ring Alarm on Child Phone
    socket.on('parent:command:ring_alarm', (data: { deviceId: string }) => {
      console.log(`[Command] Ringing loud alarm on child device: ${data.deviceId}`);
      emitToChild(data.deviceId, 'child:command:ring_alarm');
    });

    // Command: Send Flash Message / Notice to Child Phone
    socket.on('parent:command:send_message', (data: { deviceId: string; message: string }) => {
      console.log(`[Command] Sending message to child ${data.deviceId}: ${data.message}`);
      emitToChild(data.deviceId, 'child:command:send_message', { message: data.message });
    });

    // Command: Take Instant Screenshot
    socket.on('parent:command:take_screenshot', (data: { deviceId: string }) => {
      const targetId = store.getDeviceById(data.deviceId)?.id || data.deviceId;
      console.log(`[Command] Requesting screenshot from child: ${data.deviceId} -> target: ${targetId}`);
      emitToChild(data.deviceId, 'child:command:take_screenshot');
    });

    // Command: Force GPS Location Sync
    socket.on('parent:command:sync_location', (data: { deviceId: string }) => {
      console.log(`[Command] Force syncing GPS for child: ${data.deviceId}`);
      emitToChild(data.deviceId, 'child:command:sync_location');
    });

    // Command: Policy Updated
    socket.on('parent:command:sync_policy', (data: { deviceId: string }) => {
      const screenTime = store.getScreenTimePolicy(data.deviceId);
      const webFilter = store.getWebFilterPolicy(data.deviceId);
      emitToChild(data.deviceId, 'child:policy_sync', { screenTime, webFilter });
    });

    // ==========================================
    // WebRTC SIGNALING (Live Screen / Cam / Mic)
    // ==========================================

    // Track active live screen frame streamer per parent socket
    // Parent initiates stream request (screen / camera_front / camera_back / microphone)
    socket.on('webrtc:request_stream', (data: { deviceId: string; mediaType: 'screen' | 'camera_front' | 'camera_back' | 'mic' }) => {
      console.log(`[Stream Request] Parent requested ${data.mediaType} stream for device ${data.deviceId}`);
      emitToChild(data.deviceId, 'child:webrtc:start_stream', {
        parentSocketId: socket.id,
        mediaType: data.mediaType
      });
    });

    // Stop stream request
    socket.on('webrtc:stop_stream', (data: { deviceId: string }) => {
      console.log(`[Stream Stopped] Parent stopped stream for device ${data.deviceId}`);
      emitToChild(data.deviceId, 'child:webrtc:stop_stream');
    });

    // WebRTC Offer Relay (from child/sender to parent/receiver or vice-versa)
    socket.on('webrtc:offer', (data: { targetSocketId?: string; deviceId: string; sdp: any; mediaType: string }) => {
      if (data.targetSocketId) {
        io.to(data.targetSocketId).emit('webrtc:offer', { sdp: data.sdp, mediaType: data.mediaType, from: socket.id });
      } else {
        io.to(`parent:${data.deviceId}`).emit('webrtc:offer', { sdp: data.sdp, mediaType: data.mediaType, from: socket.id });
      }
    });

    // WebRTC Answer Relay
    socket.on('webrtc:answer', (data: { targetSocketId?: string; deviceId: string; sdp: any }) => {
      if (data.targetSocketId) {
        io.to(data.targetSocketId).emit('webrtc:answer', { sdp: data.sdp, from: socket.id });
      } else {
        io.to(`child:${data.deviceId}`).emit('webrtc:answer', { sdp: data.sdp, from: socket.id });
      }
    });

    // WebRTC ICE Candidate Relay
    socket.on('webrtc:ice_candidate', (data: { targetSocketId?: string; deviceId: string; candidate: any }) => {
      if (data.targetSocketId) {
        io.to(data.targetSocketId).emit('webrtc:ice_candidate', { candidate: data.candidate, from: socket.id });
      } else {
        socket.to(`device:${data.deviceId}`).emit('webrtc:ice_candidate', { candidate: data.candidate, from: socket.id });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket Disconnected] ${socket.id}`);
      if (deviceId && clientType === 'child') {
        store.updateDevice(deviceId, { status: 'offline', lastSeen: new Date().toISOString() });
        io.to(`parent:${deviceId}`).emit('device:status', { deviceId, status: 'offline' });
      }
    });
  });
}
