import React, { useState } from 'react';
import { usePWAInstall } from '../usePWAInstall';
import { ShieldCheck, Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-950/50 transition cursor-pointer"
      >
        <Download className="w-4 h-4 animate-bounce" />
        Add to Phone Home Screen
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-900/50 transition cursor-pointer"
        >
          <Smartphone className="w-4 h-4" />
          Install on iOS Phone
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl relative">
              <button 
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 text-neutral-500 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-950 flex items-center justify-center border border-emerald-800">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">Install BetAnalyst</h3>
                  <p className="text-[10px] text-neutral-400">Save to your iPhone Home Screen</p>
                </div>
              </div>

              <div className="space-y-4 text-xs text-neutral-300 border-t border-neutral-800 pt-4 leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <span className="flex-none w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-[10px] text-white">1</span>
                  <p>Tap the <span className="font-bold text-white">Share</span> button in your Safari browser navigation toolbar (at the bottom or top of your screen).</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex-none w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-[10px] text-white">2</span>
                  <p>Scroll down the menu list and select <span className="font-bold text-white">"Add to Home Screen"</span>.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex-none w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-[10px] text-white">3</span>
                  <p>Tap <span className="font-bold text-white">Add</span> in the top right corner of the prompt window to create your launch shortcut.</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-neutral-800 hover:bg-neutral-700 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback indicator button for desktop/Chrome where prompt wasn't fired yet
  return (
    <button
      onClick={() => {
        alert("To install, open this app on your Android or iOS phone's default browser (Safari or Chrome) and select 'Add to Home Screen' from your browser menu.");
      }}
      className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-white transition cursor-pointer"
    >
      <Smartphone className="w-4 h-4" />
      Phone App Guide
    </button>
  );
};
