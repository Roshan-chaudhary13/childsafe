import React from 'react';
import { Shield, Smartphone, Lock, Unlock, Plus, RefreshCw, AlertTriangle, Radio, Trash2 } from 'lucide-react';
import { ChildDevice } from '../types';

interface NavbarProps {
  devices: ChildDevice[];
  selectedDevice: ChildDevice | null;
  onSelectDevice: (device: ChildDevice) => void;
  onToggleLock: (device: ChildDevice) => void;
  onDeleteDevice: (device: ChildDevice) => void;
  onOpenPairing: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  alertCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  devices,
  selectedDevice,
  onSelectDevice,
  onToggleLock,
  onDeleteDevice,
  onOpenPairing,
  activeTab,
  setActiveTab,
  alertCount
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                FamilyShield
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 font-mono">
                PARENT PORTAL
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'screentime', label: 'Screen Time' },
              { id: 'location', label: 'Location Map' },
              { id: 'live', label: 'Remote Access' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Device Switcher & Quick Controls */}
          <div className="flex items-center gap-3">
            {/* Device Selector */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Smartphone className="w-4 h-4 text-sky-400" />
              <select
                value={selectedDevice?.id || ''}
                onChange={(e) => {
                  const dev = devices.find((d) => d.id === e.target.value);
                  if (dev) onSelectDevice(dev);
                }}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-medium"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id} className="bg-slate-900 text-slate-200">
                    {d.name} {d.status === 'online' ? '🟢' : '⚪'}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Remote Lock Button */}
            {selectedDevice && (
              <button
                onClick={() => onToggleLock(selectedDevice)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedDevice.isLocked
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
                title={selectedDevice.isLocked ? 'Device is Locked. Click to Unlock.' : 'Click to instantly lock device'}
              >
                {selectedDevice.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{selectedDevice.isLocked ? 'Locked' : 'Lock Phone'}</span>
              </button>
            )}

            {/* Delete Child Button */}
            {selectedDevice && (
              <button
                onClick={() => onDeleteDevice(selectedDevice)}
                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded-xl transition-all cursor-pointer"
                title={`Delete ${selectedDevice.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Pair New Device Button */}
            <button
              onClick={onOpenPairing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Child</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/80 overflow-x-auto gap-2">
          {['overview', 'screentime', 'location', 'live'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg capitalize whitespace-nowrap ${
                activeTab === tab ? 'bg-sky-500 text-white' : 'text-slate-400'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
