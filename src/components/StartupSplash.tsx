import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Terminal as TerminalIcon, Sparkles, Shield, Zap, CheckCircle2 } from 'lucide-react';
import { useOrchestratorStore } from '../stores/orchestratorStore';

interface StartupSplashProps {
  onComplete: () => void;
}

export const StartupSplash: React.FC<StartupSplashProps> = ({ onComplete }) => {
  const ptyWarmupState = useOrchestratorStore((s: any) => s.ptyWarmupState) || {
    isPrewarming: false,
    readySessionsCount: 1,
    totalSessionsToWarm: 1,
    isWarmupComplete: true
  };
  const [telemetryText, setTelemetryText] = useState('INITIALIZING NEURAL KERNEL & IPC BUS...');
  const [progress, setProgress] = useState(15);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const minAnimationTime = 1800; // Minimum 1.8s for smooth visual presentation
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      // Calculate progress based on real-time PTY pre-warming state & minimum animation timer
      let calcProgress = 15 + Math.min(60, (elapsed / minAnimationTime) * 60);

      if (ptyWarmupState.isPrewarming && ptyWarmupState.totalSessionsToWarm > 0) {
        const ratio = ptyWarmupState.readySessionsCount / ptyWarmupState.totalSessionsToWarm;
        calcProgress = Math.max(calcProgress, 30 + ratio * 65);
        setTelemetryText(
          `WARMING PTY SHELL MATRIX (${ptyWarmupState.readySessionsCount}/${ptyWarmupState.totalSessionsToWarm})...`
        );
      } else if (elapsed > 600 && elapsed < 1200) {
        setTelemetryText('RESOLVING WORKSPACE ENVIRONMENT & LOCK JOURNAL...');
      } else if (elapsed >= 1200 && elapsed < minAnimationTime) {
        setTelemetryText('PRE-WARMING BACKGROUND TERMINAL PIPELINES...');
      } else if (elapsed >= minAnimationTime && ptyWarmupState.isWarmupComplete) {
        calcProgress = 100;
        setTelemetryText('WARMUP COMPLETE. MOUNTING HIGH-PERFORMANCE WORKSPACE...');
        clearInterval(interval);

        // Smooth curtain exit
        setTimeout(() => {
          setIsExiting(true);
          setTimeout(() => {
            onComplete();
          }, 450);
        }, 300);
      }

      setProgress(Math.min(100, Math.round(calcProgress)));
    }, 60);

    // Safety fallback timer if warmup takes longer than 4.5s
    const safetyTimer = setTimeout(() => {
      setProgress(100);
      setTelemetryText('INITIALIZATION COMPLETE.');
      setIsExiting(true);
      setTimeout(() => {
        onComplete();
      }, 450);
    }, 4500);

    return () => {
      clearInterval(interval);
      clearTimeout(safetyTimer);
    };
  }, [ptyWarmupState.isWarmupComplete, ptyWarmupState.readySessionsCount, ptyWarmupState.totalSessionsToWarm]);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04, filter: 'blur(12px)' }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none font-sans"
        >
          {/* Ambient Cyberpunk Background Glow Mesh */}
          <div className="absolute inset-0 pointer-events-none opacity-40">
            <div className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-transparent blur-[120px] animate-pulse" />
            <div className="absolute -bottom-[20%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-tl from-indigo-500/20 via-purple-500/10 to-transparent blur-[120px] animate-pulse" style={{ animationDelay: '1.5s' }} />
          </div>

          {/* Micro Grid Background Pattern */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
              backgroundSize: '32px 32px'
            }}
          />

          {/* Main Logo & Glowing Pulse Core */}
          <div className="relative flex flex-col items-center justify-center z-10 gap-8">
            <div className="relative flex items-center justify-center">
              {/* Outer Energy Pulse Rings */}
              <motion.div
                animate={{ scale: [1, 1.25, 1], opacity: [0.15, 0.35, 0.15] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute w-36 h-36 rounded-full border border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_50px_rgba(16,185,129,0.2)]"
              />
              <motion.div
                animate={{ scale: [1.1, 1.45, 1.1], opacity: [0.08, 0.2, 0.08] }}
                transition={{ duration: 3.0, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                className="absolute w-48 h-48 rounded-full border border-cyan-500/30 bg-cyan-500/5"
              />

              {/* Central Glass Logo Frame */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-24 h-24 rounded-2xl bg-zinc-900/80 border border-zinc-700/50 backdrop-blur-xl flex items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.8)]"
              >
                <div className="relative flex items-center justify-center">
                  <Cpu className="w-10 h-10 text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-t border-r border-cyan-400/60"
                  />
                </div>
              </motion.div>
            </div>

            {/* Brand Title */}
            <div className="text-center space-y-1">
              <motion.h1
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-3xl font-extrabold tracking-wider font-sans bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent uppercase"
              >
                NEXORA <span className="text-emerald-400 font-mono text-xl">IDE</span>
              </motion.h1>
              <motion.p
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-[11px] font-mono text-zinc-400 tracking-widest uppercase flex items-center justify-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '4s' }} />
                Agentic Swarm Engine
              </motion.p>
            </div>

            {/* Telemetry Status Line & Dynamic Progress Bar */}
            <div className="w-80 space-y-3">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 px-1">
                <span className="flex items-center gap-1.5 truncate max-w-[230px]">
                  <TerminalIcon className="w-3 h-3 text-emerald-400 animate-pulse flex-shrink-0" />
                  <span className="truncate">{telemetryText}</span>
                </span>
                <span className="text-emerald-400 font-bold tracking-wider">{progress}%</span>
              </div>

              {/* Progress Bar Track */}
              <div className="w-full h-1.5 bg-zinc-900 border border-zinc-800/80 rounded-full overflow-hidden p-0.5">
                <motion.div
                  className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-indigo-500 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                  initial={{ width: '15%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                />
              </div>

              {/* Pre-warming Telemetry Badges */}
              <div className="flex items-center justify-between pt-1 text-[9px] font-mono text-zinc-500">
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-cyan-500/80" />
                  ConPTY Lock Journal
                </span>
                <span className="flex items-center gap-1 text-emerald-400/90">
                  <CheckCircle2 className="w-3 h-3" />
                  {ptyWarmupState.readySessionsCount}/{ptyWarmupState.totalSessionsToWarm || 1} Warm
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
