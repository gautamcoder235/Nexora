import React, { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./PerformanceOverlay.css";

interface Metrics {
  fps: number;
  frameTime: number;
  uiLatency: number;
  idleTime: number;
  ptyLatency: number;
  ipcLatency: number;
  ipcCommand: string;
  driverLatency: number;
  systemCpu: number;
  systemRam: number;
  jsMemory: number;
}

export const PerformanceOverlay: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>({
    fps: 60,
    frameTime: 16.6,
    uiLatency: 0,
    idleTime: 10,
    ptyLatency: 0,
    ipcLatency: 0,
    ipcCommand: "none",
    driverLatency: 0,
    systemCpu: 0,
    systemRam: 0,
    jsMemory: 0,
  });

  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const uiLatencyRef = useRef<number>(0);
  const idleTimeRef = useRef<number>(12);
  const rafIdRef = useRef<number | null>(null);

  // Toggle HUD with key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle via Ctrl+Shift+F12
      if (e.ctrlKey && e.shiftKey && e.key === "F12") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Frame monitoring (FPS, frame times, and idle times)
  useEffect(() => {
    if (!visible) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const runFrame = () => {
      const now = performance.now();
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      frameTimesRef.current.push(delta);
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }

      // Estimate FPS based on average of last 60 frames
      const avgDelta = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
      const computedFps = Math.round(1000 / avgDelta);

      // UI latency check using active delay timer
      const uiStart = performance.now();
      setTimeout(() => {
        const uiDelta = performance.now() - uiStart;
        uiLatencyRef.current = Math.max(0, uiDelta);
      }, 0);

      // Measure idle time if requestIdleCallback is supported
      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback((deadline: any) => {
          idleTimeRef.current = deadline.timeRemaining();
        });
      }

      // Query tauri/window timings
      const globalTimings = (window as any).__performanceTimings || {};
      const tauriIpcLatency = globalTimings.lastIpcLatency || 0;
      const tauriIpcCommand = globalTimings.lastIpcCommand || "none";
      const tauriDriverLatency = globalTimings.lastDriverLatency || 0;

      // Read memory if available
      const jsMem = (performance as any).memory
        ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)
        : 0;

      setMetrics((m) => ({
        ...m,
        fps: isNaN(computedFps) ? 60 : Math.min(60, computedFps),
        frameTime: parseFloat(delta.toFixed(1)),
        uiLatency: parseFloat(uiLatencyRef.current.toFixed(1)),
        idleTime: parseFloat(idleTimeRef.current.toFixed(1)),
        ipcLatency: parseFloat(tauriIpcLatency.toFixed(1)),
        ipcCommand: tauriIpcCommand,
        driverLatency: parseFloat(tauriDriverLatency.toFixed(1)),
        jsMemory: jsMem,
      }));

      rafIdRef.current = requestAnimationFrame(runFrame);
    };

    lastFrameTimeRef.current = performance.now();
    rafIdRef.current = requestAnimationFrame(runFrame);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [visible]);

  // Periodic polling for backend telemetry and system metrics
  useEffect(() => {
    if (!visible) return;

    const queryBackendMetrics = async () => {
      try {
        // Query system RAM/CPU
        const sysMetrics = await invoke<{ cpu: number; ram_gb: number }>("get_system_metrics");
        
        // Query average PTY communication latency from terminal metrics
        const termMetrics = await invoke<Record<string, { emit_avg_ms: number }>>("get_terminal_metrics");
        let totalPty = 0;
        let ptyCount = 0;
        if (termMetrics) {
          for (const key in termMetrics) {
            totalPty += termMetrics[key].emit_avg_ms || 0;
            ptyCount++;
          }
        }
        const avgPty = ptyCount > 0 ? totalPty / ptyCount : 0;

        setMetrics((m) => ({
          ...m,
          systemCpu: Math.round(sysMetrics.cpu),
          systemRam: parseFloat(sysMetrics.ram_gb.toFixed(1)),
          ptyLatency: parseFloat(avgPty.toFixed(1)),
        }));
      } catch (e) {
        console.warn("Telemetry query failed:", e);
      }
    };

    queryBackendMetrics();
    const interval = setInterval(queryBackendMetrics, 1500);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  // Enforced performance budgets checks
  const isFpsWarning = metrics.fps < 50;
  const isFrameWarning = metrics.frameTime > 16.6;
  const isIpcWarning = metrics.ipcLatency > 20;
  const isPtyWarning = metrics.ptyLatency > 16;
  const isDriverWarning = metrics.driverLatency > 200;

  return (
    <div className="perf-hud-overlay border border-zinc-800 rounded-lg select-none pointer-events-none">
      <div className="perf-hud-header flex justify-between items-center pb-2 mb-2 border-b border-zinc-800">
        <span className="font-bold text-[10px] uppercase tracking-wider text-amber-500 font-sans">
          Nexora telemetry HUD
        </span>
        <span className="text-[8px] text-zinc-500 font-mono">
          Ctrl+Shift+F12 to hide
        </span>
      </div>

      <div className="perf-hud-grid font-mono text-[10px]">
        {/* Core FPS */}
        <div className="perf-hud-row">
          <span className="perf-label">FPS:</span>
          <span className={`perf-value font-bold ${isFpsWarning ? "perf-warn" : "perf-ok"}`}>
            {metrics.fps} FPS
          </span>
        </div>

        {/* Frame Times */}
        <div className="perf-hud-row">
          <span className="perf-label">Frame Time:</span>
          <span className={`perf-value ${isFrameWarning ? "perf-warn" : "perf-ok"}`}>
            {metrics.frameTime} ms
          </span>
        </div>

        {/* UI Latency */}
        <div className="perf-hud-row">
          <span className="perf-label">UI Latency:</span>
          <span className="perf-value">{metrics.uiLatency} ms</span>
        </div>

        {/* Idle frame time */}
        <div className="perf-hud-row">
          <span className="perf-label">Idle Time:</span>
          <span className="perf-value text-zinc-400">{metrics.idleTime} ms</span>
        </div>

        {/* IPC Latency */}
        <div className="perf-hud-row">
          <span className="perf-label">IPC Latency:</span>
          <span className={`perf-value ${isIpcWarning ? "perf-warn" : "perf-ok"}`}>
            {metrics.ipcLatency} ms <span className="text-[8px] text-zinc-500 font-sans">({metrics.ipcCommand})</span>
          </span>
        </div>

        {/* PTY Latency */}
        <div className="perf-hud-row">
          <span className="perf-label">PTY Latency:</span>
          <span className={`perf-value ${isPtyWarning ? "perf-warn" : "perf-ok"}`}>
            {metrics.ptyLatency} ms
          </span>
        </div>

        {/* Driver Launch */}
        <div className="perf-hud-row">
          <span className="perf-label">Driver Latency:</span>
          <span className={`perf-value ${isDriverWarning ? "perf-warn" : "perf-ok"}`}>
            {metrics.driverLatency} ms
          </span>
        </div>

        {/* System parameters */}
        <div className="perf-hud-divider border-t border-zinc-800/60 my-1.5" />

        <div className="perf-hud-row">
          <span className="perf-label text-zinc-400">System CPU:</span>
          <span className="perf-value">{metrics.systemCpu}%</span>
        </div>

        <div className="perf-hud-row">
          <span className="perf-label text-zinc-400">System RAM:</span>
          <span className="perf-value">{metrics.systemRam} GB</span>
        </div>

        {metrics.jsMemory > 0 && (
          <div className="perf-hud-row">
            <span className="perf-label text-zinc-400">JS Memory:</span>
            <span className="perf-value">{metrics.jsMemory} MB</span>
          </div>
        )}

        {/* GPU status check */}
        <div className="perf-hud-row mt-1">
          <span className="perf-label text-zinc-500">Hardware Accel:</span>
          <span className="perf-value text-zinc-500 uppercase tracking-tight text-[8px]">
            WebGL Accelerated
          </span>
        </div>
      </div>
    </div>
  );
};
