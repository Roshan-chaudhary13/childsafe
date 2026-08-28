import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Overview } from './pages/Overview';
import { ScreenTimeView } from './pages/ScreenTimeView';
import { LocationTrackerView } from './pages/LocationTrackerView';
import { LiveMonitorView } from './pages/LiveMonitorView';
import { RemoteAccessView } from './pages/RemoteAccessView';
import { PairingModal } from './pages/PairingModal';
import { api, getSocket } from './lib/api';
import {
  ChildDevice,
  ScreenTimePolicy,
  WebFilterPolicy,
  LocationPoint,
  AppUsage,
  RemoteScreenshot,
  SafetyAlert
} from './types';

export function App() {
  const [devices, setDevices] = useState<ChildDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<ChildDevice | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');

  const [screenTime, setScreenTime] = useState<ScreenTimePolicy | null>(null);
  const [webFilter, setWebFilter] = useState<WebFilterPolicy | null>(null);
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [appUsages, setAppUsages] = useState<AppUsage[]>([]);
  const [screenshots, setScreenshots] = useState<RemoteScreenshot[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [isPairingOpen, setIsPairingOpen] = useState<boolean>(false);

  const socket = getSocket(selectedDevice?.id);

  // Load Devices on start and periodic health sync
  useEffect(() => {
    async function loadInitial() {
      try {
        const devs = await api.getDevices();
        setDevices(devs);
        setSelectedDevice((prev) => {
          if (!prev && devs.length > 0) return devs[0];
          const matched = devs.find((d) => d.id === prev?.id);
          return matched || prev;
        });
      } catch (err) {
        console.error('Failed to load devices:', err);
      }
    }
    loadInitial();
    const interval = setInterval(loadInitial, 4000);
    return () => clearInterval(interval);
  }, []);

  // Load Device details when selected device changes
  useEffect(() => {
    if (!selectedDevice) return;
    const devId = selectedDevice.id;

    async function loadData() {
      try {
        socket.emit('parent:select_device', { deviceId: devId });
        const [st, wf, locs, usage, shots, alts] = await Promise.all([
          api.getScreenTime(devId),
          api.getWebFilter(devId),
          api.getLocations(devId),
          api.getAppUsage(devId),
          api.getScreenshots(devId),
          api.getAlerts(devId)
        ]);

        setScreenTime(st);
        setWebFilter(wf);
        setLocations(locs);
        setAppUsages(usage);
        setScreenshots(shots);
        setAlerts(alts);
      } catch (err) {
        console.error('Error loading device data:', err);
      }
    }

    loadData();
  }, [selectedDevice?.id, socket]);

  // Socket Realtime Listeners
  useEffect(() => {
    if (!socket || !selectedDevice) return;

    // Device online/offline status
    socket.on('device:status', (data: { deviceId: string; status: 'online' | 'offline' }) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId || d.pairingCode === data.deviceId ? { ...d, status: data.status, isPaired: true } : d))
      );
      setSelectedDevice((prev) =>
        prev && (prev.id === data.deviceId || prev.pairingCode === data.deviceId)
          ? { ...prev, status: data.status, isPaired: true }
          : prev
      );
    });

    // Telemetry updates
    socket.on('parent:telemetry_update', (data: any) => {
      if (data.deviceId === selectedDevice.id) {
        setSelectedDevice((prev) =>
          prev ? { ...prev, batteryLevel: data.batteryLevel, isCharging: data.isCharging, status: 'online' } : null
        );
      }
    });

    // Location updates
    socket.on('parent:location_update', (loc: LocationPoint) => {
      if (loc.deviceId === selectedDevice.id) {
        setLocations((prev) => [loc, ...prev]);
      }
    });

    // App Usage updates
    socket.on('parent:usage_update', (usages: AppUsage[]) => {
      setAppUsages(usages);
    });

    // New Screenshots
    socket.on('parent:screenshot_received', (shot: RemoteScreenshot) => {
      console.log('[Parent Dashboard] Screenshot received:', shot);
      setScreenshots((prev) => [shot, ...prev.filter((s) => s.id !== shot.id)]);
    });

    // New Safety Alerts
    socket.on('parent:new_alert', (alert: SafetyAlert) => {
      setAlerts((prev) => [alert, ...prev]);
    });

    return () => {
      socket.off('parent:telemetry_update');
      socket.off('parent:location_update');
      socket.off('parent:usage_update');
      socket.off('parent:screenshot_received');
      socket.off('parent:new_alert');
    };
  }, [socket, selectedDevice]);

  // Remote Lock Toggle
  const handleToggleLock = (device: ChildDevice) => {
    const nextLocked = !device.isLocked;
    socket.emit('parent:command:lock', {
      deviceId: device.id,
      lock: nextLocked
    });
    setSelectedDevice({ ...device, isLocked: nextLocked });
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, isLocked: nextLocked } : d)));
  };

  // Screen Time Policy Update
  const handleSaveScreenTime = async (updated: Partial<ScreenTimePolicy>) => {
    if (!selectedDevice) return;
    const res = await api.updateScreenTime(selectedDevice.id, updated);
    setScreenTime(res);
    socket.emit('parent:command:sync_policy', { deviceId: selectedDevice.id });
  };

  // Web Filter Policy Update
  const handleSaveWebFilter = async (updated: Partial<WebFilterPolicy>) => {
    if (!selectedDevice) return;
    const res = await api.updateWebFilter(selectedDevice.id, updated);
    setWebFilter(res);
    socket.emit('parent:command:sync_policy', { deviceId: selectedDevice.id });
  };

  // Request Remote Screenshot
  // Request Remote Screenshot
  const handleRequestScreenshot = async () => {
    if (!selectedDevice) return;
    socket.emit('parent:command:take_screenshot', { deviceId: selectedDevice.id });
    
    // Quick polling fallback to guarantee gallery refresh
    setTimeout(async () => {
      try {
        const shots = await api.getScreenshots(selectedDevice.id);
        if (shots.length > 0) {
          setScreenshots(shots);
        }
      } catch (e) {
        console.error('Failed to reload screenshots:', e);
      }
    }, 1200);
  };

  // Delete Individual Screenshot
  const handleDeleteScreenshot = async (id: string) => {
    try {
      await api.deleteScreenshot(id);
      setScreenshots((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error('Failed to delete screenshot:', e);
    }
  };

  // Delete All Screenshots
  const handleDeleteAllScreenshots = async () => {
    if (!selectedDevice) return;
    try {
      await api.deleteAllScreenshots(selectedDevice.id);
      setScreenshots([]);
    } catch (e) {
      console.error('Failed to delete all screenshots:', e);
    }
  };

  // Delete Child Device
  const handleDeleteDevice = async (device: ChildDevice) => {
    if (!window.confirm(`Are you sure you want to delete "${device.name}"? This will remove all logs, screen time rules, and screenshots.`)) {
      return;
    }
    try {
      await api.deleteDevice(device.id);
      const remaining = devices.filter((d) => d.id !== device.id);
      setDevices(remaining);
      setSelectedDevice(remaining.length > 0 ? remaining[0] : null);
    } catch (e) {
      console.error('Failed to delete device:', e);
    }
  };

  if (!selectedDevice) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-3xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto text-3xl">
            🛡️
          </div>
          <h2 className="text-lg font-bold text-white">No Child Devices Configured</h2>
          <p className="text-xs text-slate-400">Add and pair your first child device to begin protection.</p>
          <button
            onClick={() => setIsPairingOpen(true)}
            className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
          >
            + Add Child Device
          </button>
        </div>

        {/* Pairing Modal */}
        <PairingModal
          isOpen={isPairingOpen}
          onClose={() => setIsPairingOpen(false)}
          onDevicePaired={(dev) => {
            setDevices((prev) => [...prev, dev]);
            setSelectedDevice(dev);
            setIsPairingOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col selection:bg-sky-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        devices={devices}
        selectedDevice={selectedDevice}
        onSelectDevice={(d) => setSelectedDevice(d)}
        onToggleLock={handleToggleLock}
        onDeleteDevice={handleDeleteDevice}
        onOpenPairing={() => setIsPairingOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        alertCount={alerts.length}
      />

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && (
          <Overview
            device={selectedDevice}
            screenTime={screenTime}
            webFilter={webFilter}
            latestLocation={locations[0] || null}
            appUsages={appUsages}
            alerts={alerts}
            onNavigateTab={setActiveTab}
            onToggleLock={() => handleToggleLock(selectedDevice)}
          />
        )}

        {activeTab === 'screentime' && screenTime && (
          <ScreenTimeView
            policy={screenTime}
            appUsages={appUsages}
            onSavePolicy={handleSaveScreenTime}
          />
        )}

        {activeTab === 'location' && (
          <LocationTrackerView
            deviceId={selectedDevice.id}
            locations={locations}
            onRefreshLocation={() => {
              socket.emit('child:location', {
                deviceId: selectedDevice.id,
                latitude: 37.7749 + (Math.random() - 0.5) * 0.005,
                longitude: -122.4194 + (Math.random() - 0.5) * 0.005,
                accuracy: 5
              });
            }}
          />
        )}

        {activeTab === 'live' && (
          <LiveMonitorView
            deviceId={selectedDevice.id}
            socket={socket}
            screenshots={screenshots}
            onRequestScreenshot={handleRequestScreenshot}
            onDeleteScreenshot={handleDeleteScreenshot}
            onDeleteAllScreenshots={handleDeleteAllScreenshots}
          />
        )}

        {activeTab === 'remote' && (
          <RemoteAccessView
            device={selectedDevice}
            socket={socket}
            onToggleLock={() => handleToggleLock(selectedDevice)}
            onRequestScreenshot={handleRequestScreenshot}
            onRequestLocation={() => {
              socket.emit('child:location', {
                deviceId: selectedDevice.id,
                latitude: 37.7749 + (Math.random() - 0.5) * 0.005,
                longitude: -122.4194 + (Math.random() - 0.5) * 0.005,
                accuracy: 5
              });
            }}
          />
        )}
      </main>

      {/* Pairing Modal */}
      <PairingModal
        isOpen={isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
        onDevicePaired={(dev) => {
          setDevices((prev) => [...prev, dev]);
          setSelectedDevice(dev);
          setIsPairingOpen(false);
        }}
      />
    </div>
  );
}

export default App;
