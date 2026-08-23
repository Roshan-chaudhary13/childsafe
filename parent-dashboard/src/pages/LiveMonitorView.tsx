import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Mic,
  Monitor,
  Radio,
  Image as ImageIcon,
  Square,
  Volume2,
  VolumeX,
  Trash2,
  CheckSquare,
  Square as CheckboxBlank,
  X,
  Lock,
  Unlock,
  Bell,
  MessageSquare,
  MapPin,
  Send,
  Smartphone
} from 'lucide-react';
import { Socket } from 'socket.io-client';
import { RemoteScreenshot, ChildDevice } from '../types';

interface LiveMonitorViewProps {
  deviceId: string;
  device?: ChildDevice | null;
  socket: Socket;
  screenshots: RemoteScreenshot[];
  onRequestScreenshot: () => void;
  onDeleteScreenshot: (id: string) => Promise<void>;
  onDeleteAllScreenshots: () => Promise<void>;
  onToggleLock?: (device: ChildDevice) => void;
}

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({
  deviceId,
  device,
  socket,
  screenshots,
  onRequestScreenshot,
  onDeleteScreenshot,
  onDeleteAllScreenshots,
  onToggleLock
}) => {
  const [activeMediaType, setActiveMediaType] = useState<'screen' | 'camera_front' | 'camera_back' | 'mic' | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<RemoteScreenshot | null>(null);
  const [streamStatus, setStreamStatus] = useState<string>('Ready for Remote Access');
  const [latestLiveFrame, setLatestLiveFrame] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [isSyncingGps, setIsSyncingGps] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messageSentFeedback, setMessageSentFeedback] = useState(false);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === screenshots.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(screenshots.map((s) => s.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(Delete ${selectedIds.size} selected screenshot(s)?)) return;
    for (const id of Array.from(selectedIds)) {
      await onDeleteScreenshot(id);
    }
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  const handleDeleteAll = async () => {
    if (screenshots.length === 0) return;
    if (!window.confirm(Are you sure you want to delete ALL ${screenshots.length} screenshots?)) return;
    await onDeleteAllScreenshots();
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  // Remote Commands
  const handleRingAlarm = () => {
    setIsRinging(true);
    socket.emit('parent:command:ring_alarm', { deviceId });
    setTimeout(() => setIsRinging(false), 5000);
  };

  const handleSyncGps = () => {
    setIsSyncingGps(true);
    socket.emit('parent:command:sync_location', { deviceId });
    setTimeout(() => setIsSyncingGps(false), 2000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    socket.emit('parent:command:send_message', {
      deviceId,
      message: messageText.trim()
    });
    setMessageText('');
    setMessageSentFeedback(true);
    setTimeout(() => setMessageSentFeedback(false), 3000);
  };

  // Live Stream Setup
  const startStream = (mediaType: 'screen' | 'camera_front' | 'camera_back' | 'mic') => {
    setActiveMediaType(mediaType);
    setIsStreaming(true);
    setStreamStatus(Connecting Live ${mediaType}...);

    socket.emit('webrtc:request_stream', {
      deviceId,
      mediaType
    });

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice_candidate', {
          deviceId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      setStreamStatus('Live Stream Connected 🟢');
      if (event.track.kind === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(console.error);
      } else if (event.track.kind === 'audio' && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(console.error);
      }
    };

    peerConnectionRef.current = pc;
  };

  const stopStream = () => {
    setIsStreaming(false);
    setActiveMediaType(null);
    setLatestLiveFrame(null);
    setStreamStatus('Ready for Remote Access');
    socket.emit('webrtc:stop_stream', { deviceId });

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    const handleScreenFrame = (data: { deviceId: string; frame: string }) => {
      setLatestLiveFrame(data.frame);
      setStreamStatus('Live Screen Mirror Connected 🟢');
    };

    socket.on('parent:screen_frame', handleScreenFrame);

    return () => {
      socket.off('parent:screen_frame', handleScreenFrame);
    };
  }, [socket, deviceId]);

  const handleCaptureClick = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    onRequestScreenshot();
    setTimeout(() => {
      setIsCapturing(false);
    }, 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-sky-400" />
            Remote Access &amp; Control
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Access child screen live anytime, trigger instant remote actions, and view captures.
          </p>
        </div>

        {/* Action Header Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCaptureClick}
            disabled={isCapturing}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
          >
            {isCapturing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Capturing...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                Capture Screenshot
              </>
            )}
          </button>
        </div>
      </div>

      {/* Instant Remote Command Deck */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* 1. Remote Lock */}
        {device && onToggleLock && (
          <button
            onClick={() => onToggleLock(device)}
            className={p-4 rounded-2xl border text-left flex flex-col justify-between gap-3 transition-all cursor-pointer ${
              device.isLocked
                ? 'bg-rose-950/30 border-rose-500/50 hover:bg-rose-950/40 text-rose-300'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-200'
            }}
          >
            <div className="flex items-center justify-between">
              <div className={p-2 rounded-xl ${device.isLocked ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-sky-400'}}>
                {device.isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
              </div>
              <span className={	ext-[10px] font-bold px-2 py-0.5 rounded-full ${device.isLocked ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}}>
                {device.isLocked ? 'LOCKED' : 'ACTIVE'}
              </span>
            </div>
            <div>
              <div className="text-xs font-bold">{device.isLocked ? 'Unlock Phone' : 'Lock Phone'}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Instant lockout overlay</div>
            </div>
          </button>
        )}

        {/* 2. Ring Lost Phone */}
        <button
          onClick={handleRingAlarm}
          disabled={isRinging}
          className="p-4 rounded-2xl border bg-slate-900 border-slate-800 hover:border-amber-500/50 text-slate-200 text-left flex flex-col justify-between gap-3 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Bell className={w-5 h-5 ${isRinging ? 'animate-bounce' : ''}} />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              ALARM
            </span>
          </div>
          <div>
            <div className="text-xs font-bold">{isRinging ? 'Ringing Device...' : 'Ring Lost Phone'}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Loud sound even if silent</div>
          </div>
        </button>

        {/* 3. Force GPS Sync */}
        <button
          onClick={handleSyncGps}
          disabled={isSyncingGps}
          className="p-4 rounded-2xl border bg-slate-900 border-slate-800 hover:border-emerald-500/50 text-slate-200 text-left flex flex-col justify-between gap-3 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <MapPin className={w-5 h-5 ${isSyncingGps ? 'animate-spin' : ''}} />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              GPS
            </span>
          </div>
          <div>
            <div className="text-xs font-bold">{isSyncingGps ? 'Syncing Pin...' : 'Force GPS Sync'}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Request live location</div>
          </div>
        </button>

        {/* 4. Send Notice Form */}
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            Send Notice
          </div>
          <form onSubmit={handleSendMessage} className="flex gap-1.5">
            <input
              type="text"
              placeholder="Message child..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              className="p-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-xs cursor-pointer transition-colors"
              title="Send notice to phone"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
          <div className="text-[10px] text-slate-400">
            {messageSentFeedback ? <span className="text-emerald-400 font-semibold">Sent to screen!</span> : 'Pops up alert on child screen'}
          </div>
        </div>
      </div>

      {/* Main Stream & Gallery Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Live Video Console */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={w-2.5 h-2.5 rounded-full ${isStreaming ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'}} />
              <h3 className="text-sm font-bold text-white">Live Remote Console</h3>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {streamStatus}
            </span>
          </div>

          {/* Video / Mirror Display */}
          <div className="relative aspect-video bg-slate-950 rounded-2xl border border-slate-800/90 overflow-hidden flex items-center justify-center">
            {isStreaming ? (
              latestLiveFrame ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={latestLiveFrame}
                    alt="Live Screen Stream"
                    className="w-full h-full object-contain select-none"
                  />
                  <div className="absolute top-3 left-3 bg-emerald-500/90 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-lg backdrop-blur">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    LIVE MIRROR ACTIVE
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-sky-400">Streaming Remote Screen...</p>
                  <p className="text-xs text-slate-500">Establishing direct frame transfer with child device</p>
                </div>
              )
            ) : (
              <div className="text-center p-6 space-y-2">
                <Smartphone className="w-12 h-12 text-slate-700 mx-auto" />
                <p className="text-sm font-semibold text-slate-300">Remote Screen Inactive</p>
                <p className="text-xs text-slate-500 max-w-sm">
                  Click <strong>"Live Screen Mirror"</strong> below to view child's screen in real time anytime.
                </p>
              </div>
            )}

            <audio ref={remoteAudioRef} autoPlay muted={isMuted} />

            {/* On-video Floating Bar */}
            {isStreaming && (
              <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur border border-slate-800 px-4 py-2 rounded-xl flex items-center justify-between text-xs">
                <span className="font-semibold text-white uppercase text-[11px] tracking-wider">
                  {activeMediaType?.replace('_', ' ')}
                </span>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  </button>
                  <button
                    onClick={stopStream}
                    className="px-3 py-1 bg-rose-500 hover:bg-rose-400 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" /> Stop Stream
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Stream Switcher Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {[
              { id: 'screen', label: 'Live Screen Mirror', icon: Monitor },
              { id: 'camera_front', label: 'Front Camera', icon: Camera },
              { id: 'camera_back', label: 'Rear Camera', icon: Camera },
              { id: 'mic', label: 'Surround Audio', icon: Mic }
            ].map((stream) => {
              const Icon = stream.icon;
              const isSelected = activeMediaType === stream.id && isStreaming;
              return (
                <button
                  key={stream.id}
                  onClick={() => (isSelected ? stopStream() : startStream(stream.id as any))}
                  className={p-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-md shadow-sky-500/20'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }}
                >
                  <Icon className="w-4 h-4 text-sky-400" />
                  {stream.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 1 Col: Screenshot Evidence Gallery */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-amber-400" />
              Screenshots
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">
                {screenshots.length} Captured
              </span>
              {screenshots.length > 0 && (
                <button
                  onClick={() => setIsSelectMode(!isSelectMode)}
                  className={px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                    isSelectMode ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }}
                >
                  {isSelectMode ? 'Cancel' : 'Select'}
                </button>
              )}
            </div>
          </div>

          {/* Action Toolbar for Selection / Delete All */}
          {screenshots.length > 0 && (
            <div className="flex items-center justify-between gap-2 p-2 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              {isSelectMode ? (
                <>
                  <button
                    onClick={selectAll}
                    className="text-slate-300 hover:text-white flex items-center gap-1.5"
                  >
                    {selectedIds.size === screenshots.length ? (
                      <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <CheckboxBlank className="w-3.5 h-3.5" />
                    )}
                    {selectedIds.size === screenshots.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={selectedIds.size === 0}
                    className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-lg flex items-center gap-1 text-[11px] font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.size})
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDeleteAll}
                  className="w-full py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete All Screenshots
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-3 max-h-[500px] pr-1">
            {screenshots.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs italic">
                No screenshots captured yet. Click "Capture Screenshot" above.
              </div>
            ) : (
              screenshots.map((shot) => {
                const isSelected = selectedIds.has(shot.id);
                return (
                  <div
                    key={shot.id}
                    onClick={() => (isSelectMode ? toggleSelect(shot.id, { stopPropagation: () => {} } as any) : setSelectedScreenshot(shot))}
                    className={group relative bg-slate-950 border rounded-xl overflow-hidden cursor-pointer transition-all ${
                      isSelected
                        ? 'border-amber-500 ring-2 ring-amber-500/30'
                        : 'border-slate-800 hover:border-sky-500/50'
                    }}
                  >
                    {isSelectMode && (
                      <div
                        onClick={(e) => toggleSelect(shot.id, e)}
                        className="absolute top-2 left-2 z-10 p-1 bg-slate-900/90 rounded-md border border-slate-700 text-amber-400"
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <CheckboxBlank className="w-4 h-4 text-slate-400" />}
                      </div>
                    )}
                    
                    {!isSelectMode && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm('Delete this screenshot?')) {
                            await onDeleteScreenshot(shot.id);
                          }
                        }}
                        className="absolute top-2 right-2 z-10 p-1.5 bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg border border-rose-700/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-lg"
                        title="Delete Screenshot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div className="aspect-[16/9] w-full bg-slate-950 overflow-hidden flex items-center justify-center">
                      <img
                        src={shot.imageUrl}
                        alt="Remote Screenshot"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="p-2.5 bg-slate-900/90 flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-mono">{new Date(shot.timestamp).toLocaleTimeString()}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 capitalize">
                        {shot.triggeredBy}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Screenshot Fullscreen Modal */}
      {selectedScreenshot && (
        <div
          onClick={() => setSelectedScreenshot(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">Screenshot Detail</span>
              <div className="flex items-center gap-3">
                <span className="text-slate-400 font-mono">{new Date(selectedScreenshot.timestamp).toLocaleString()}</span>
                <button
                  onClick={async () => {
                    if (window.confirm('Delete this screenshot?')) {
                      await onDeleteScreenshot(selectedScreenshot.id);
                      setSelectedScreenshot(null);
                    }
                  }}
                  className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded-lg flex items-center gap-1 text-[11px] font-semibold border border-rose-500/30 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <button
                  onClick={() => setSelectedScreenshot(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-hidden rounded-xl bg-slate-950 flex items-center justify-center">
              <img
                src={selectedScreenshot.imageUrl}
                alt="Full Screenshot"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <p className="text-[11px] text-slate-500 text-center">Click outside or press X to close</p>
          </div>
        </div>
      )}
    </div>
  );
};
