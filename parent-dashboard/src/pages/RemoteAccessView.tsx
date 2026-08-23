import React, { useState } from 'react';
import { 
  Radio, 
  Lock, 
  Unlock, 
  Bell, 
  MessageSquare, 
  Camera, 
  MapPin, 
  Battery, 
  ShieldCheck, 
  Terminal, 
  Smartphone, 
  Send, 
  Volume2 
} from 'lucide-react';
import { Socket } from 'socket.io-client';
import { ChildDevice } from '../types';

interface RemoteAccessViewProps {
  device: ChildDevice;
  socket: Socket | null;
  onToggleLock: () => void;
  onRequestScreenshot: () => void;
  onRequestLocation: () => void;
}

interface CommandLog {
  id: string;
  timestamp: string;
  command: string;
  status: string;
  details?: string;
}

export const RemoteAccessView: React.FC<RemoteAccessViewProps> = ({
  device,
  socket,
  onToggleLock,
  onRequestScreenshot,
  onRequestLocation
}) => {
  const [flashMessage, setFlashMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSirenActive, setIsSirenActive] = useState(false);
  const [logs, setLogs] = useState<CommandLog[]>([
    {
      id: '1',
      timestamp: new Date().toLocaleTimeString(),
      command: 'SYSTEM_INIT',
      status: 'ack',
      details: `Connected to ${device.name} (${device.id})`
    }
  ]);

  const addLog = (command: string, details?: string) => {
    setLogs((prev) => [
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        command,
        status: 'sent',
        details
      },
      ...prev.slice(0, 19)
    ]);
  };

  const handleToggleSiren = () => {
    const nextState = !isSirenActive;
    setIsSirenActive(nextState);
    socket?.emit('parent:command:siren', {
      deviceId: device.id,
      enable: nextState
    });
    addLog(nextState ? 'PLAY_SIREN_ALARM' : 'STOP_SIREN_ALARM', nextState ? 'High-priority siren sound dispatched' : 'Siren muted');
  };

  const handleSendFlashMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flashMessage.trim()) return;

    setIsSendingMessage(true);
    socket?.emit('parent:command:send_message', {
      deviceId: device.id,
      title: 'Urgent Message from Parent',
      message: flashMessage.trim()
    });

    addLog('FLASH_MESSAGE', flashMessage.trim());
    setFlashMessage('');
    setTimeout(() => setIsSendingMessage(false), 800);
  };

  const handleManualLock = () => {
    onToggleLock();
    addLog(device.isLocked ? 'REMOTE_UNLOCK' : 'REMOTE_LOCK', device.isLocked ? 'Screen unlocked' : 'Screen locked by parent');
  };

  const handleSnapshot = () => {
    onRequestScreenshot();
    addLog('TAKE_SNAPSHOT', 'Silent hardware screenshot requested');
  };

  const handleLocationPing = () => {
    onRequestLocation();
    socket?.emit('parent:command:request_location', { deviceId: device.id });
    addLog('PING_GPS', 'Requested precise device GPS coordinates');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-sky-400 animate-pulse" />
            Remote Access &amp; Device Control
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Execute real-time remote commands, trigger alarms, send instant screen alerts, and audit device telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Tunnel Connected
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-400" />
              Instant Remote Controls
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={handleManualLock}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  device.isLocked
                    ? 'bg-red-950/20 border-red-500/40 text-red-300 hover:bg-red-950/40'
                    : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-sky-500/50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Lockout Control</span>
                  {device.isLocked ? <Lock className="w-4 h-4 text-red-400" /> : <Unlock className="w-4 h-4 text-slate-400" />}
                </div>
                <div className="mt-3">
                  <div className="text-sm font-bold text-white">
                    {device.isLocked ? 'Unlock Child Phone' : 'Instantly Lock Phone'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {device.isLocked ? 'Phone is locked. Click to release.' : 'Show full lockout overlay on screen.'}
                  </div>
                </div>
              </button>

              <button
                onClick={handleToggleSiren}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSirenActive
                    ? 'bg-amber-950/20 border-amber-500/40 text-amber-300 hover:bg-amber-950/40'
                    : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-amber-500/50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Lost Phone Alert</span>
                  {isSirenActive ? <Volume2 className="w-4 h-4 text-amber-400 animate-bounce" /> : <Bell className="w-4 h-4 text-slate-400" />}
                </div>
                <div className="mt-3">
                  <div className="text-sm font-bold text-white">
                    {isSirenActive ? 'Silence Siren Alarm' : 'Ring Lost Phone Siren'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {isSirenActive ? 'Alarm playing at maximum volume.' : 'Plays high-volume alert on child device.'}
                  </div>
                </div>
              </button>

              <button
                onClick={handleSnapshot}
                className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-indigo-500/50 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Silent Capture</span>
                  <Camera className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="mt-3">
                  <div className="text-sm font-bold text-white">Request Snapshot</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Takes silent background screenshot now.
                  </div>
                </div>
              </button>

              <button
                onClick={handleLocationPing}
                className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-emerald-500/50 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">GPS Ping</span>
                  <MapPin className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-3">
                  <div className="text-sm font-bold text-white">Refresh Location</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Queries device GPS for instant coordinate update.
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              Send Flash Screen Notice
            </h3>
            <p className="text-xs text-slate-400">
              Dispatches an urgent popup alert directly over the child screen.
            </p>

            <form onSubmit={handleSendFlashMessage} className="flex gap-2">
              <input
                type="text"
                value={flashMessage}
                onChange={(e) => setFlashMessage(e.target.value)}
                placeholder="Type urgent notice for child screen..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={!flashMessage.trim() || isSendingMessage}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-sky-400" />
              Hardware Telemetry
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Device ID</span>
                <span className="font-mono text-slate-200 font-bold">{device.id}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Status</span>
                <span className={`font-semibold flex items-center gap-1 ${device.status === 'online' ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {device.status === 'online' ? '🟢 Online (Protected)' : '⚪ Offline'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Battery Level</span>
                <span className="font-bold text-slate-200 flex items-center gap-1">
                  <Battery className="w-3.5 h-3.5 text-sky-400" />
                  {device.batteryLevel ?? 85}% {device.isCharging ? '⚡' : ''}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Silent Accessibility</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Active
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Background Engine</span>
                <span className="text-sky-400 font-semibold">24/7 Persistent</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Command Dispatch Log
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Live</span>
            </div>

            <div className="h-48 overflow-y-auto space-y-2 pr-1 font-mono text-[11px]">
              {logs.map((log) => (
                <div key={log.id} className="p-2 bg-slate-950/80 rounded-lg border border-slate-800/60 space-y-0.5">
                  <div className="flex items-center justify-between text-slate-500 text-[10px]">
                    <span>{log.timestamp}</span>
                    <span className="text-emerald-400">{log.status}</span>
                  </div>
                  <div className="text-sky-300 font-bold">{log.command}</div>
                  {log.details && <div className="text-slate-400 text-[10px] truncate">{log.details}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
