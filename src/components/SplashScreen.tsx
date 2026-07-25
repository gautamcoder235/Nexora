import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TitleBar } from './TitleBar';

export interface SplashScreenProps {
  onComplete?: () => void;
  durationMs?: number;
}

const BOOT_STAGES = [
  { stage: 'SYS.INIT', label: 'Initializing Event Bus & IPC Channels...', targetProgress: 20 },
  { stage: 'PTY.CORE', label: 'Warming PTY Shells & Terminal Nodes...', targetProgress: 45 },
  { stage: 'AI.SWARM', label: 'Syncing Vector Memory & Agent Registry...', targetProgress: 70 },
  { stage: 'VFS.MOUNT', label: 'Mounting Virtual Workspace File System...', targetProgress: 90 },
  { stage: 'READY', label: 'Core Handshake Confirmed. Launching...', targetProgress: 100 },
];

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onComplete,
  durationMs = 4000,
}) => {
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const stageInterval = durationMs / BOOT_STAGES.length;

    // Progress and stage timer drive
    const timer = setInterval(() => {
      setCurrentStageIdx((prev) => {
        const next = prev + 1;
        if (next < BOOT_STAGES.length) {
          setProgress(BOOT_STAGES[next].targetProgress);
          return next;
        } else {
          clearInterval(timer);
          return prev;
        }
      });
    }, stageInterval);

    // Initial stage progress setup
    setProgress(BOOT_STAGES[0].targetProgress);

    // Exit trigger
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, durationMs - 550);

    const completeTimer = setTimeout(() => {
      if (onComplete) onComplete();
    }, durationMs);

    return () => {
      clearInterval(timer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [durationMs, onComplete]);

  const activeStage = BOOT_STAGES[currentStageIdx];

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          data-tauri-drag-region
          initial={{ opacity: 1 }}
          exit={{ 
            opacity: 0, 
            scale: 1.04,
            filter: 'blur(16px)',
            transition: { duration: 0.55, ease: [0.87, 0, 0.13, 1] } 
          }}
          className="h-screen w-screen bg-[#07080f] flex flex-col justify-center items-center font-sans overflow-hidden select-none relative z-[9999] cursor-default"
        >
          <TitleBar />

          {/* ── Ambient Background Glow & Matrix ─────────────────────────── */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {/* Indigo/Violet Top-Left Sphere */}
            <motion.div
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.35, 0.5, 0.35],
              }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-[-10%] left-[-10%] w-[65vw] h-[65vw] rounded-full bg-gradient-to-tr from-indigo-600/25 via-violet-600/15 to-transparent blur-[140px]"
            />

            {/* Cyan/Blue Bottom-Right Sphere */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.45, 0.3],
              }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute bottom-[-15%] right-[-15%] w-[65vw] h-[65vw] rounded-full bg-gradient-to-br from-cyan-500/20 via-blue-600/15 to-transparent blur-[140px]"
            />

            {/* Radial Masked Cyber Grid */}
            <div
              className="absolute inset-0 opacity-[0.025]"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(255,255,255,0.15) 1px, transparent 1px)
                `,
                backgroundSize: '32px 32px',
                maskImage: 'radial-gradient(circle at center, black 25%, transparent 80%)',
                WebkitMaskImage: 'radial-gradient(circle at center, black 25%, transparent 80%)',
              }}
            />

            {/* Micro Particles */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  x: (i % 2 === 0 ? 1 : -1) * (150 + i * 40),
                  y: (i % 3 === 0 ? 1 : -1) * (100 + i * 35),
                  opacity: 0.3,
                }}
                animate={{
                  y: ['-15px', '15px', '-15px'],
                  x: ['-10px', '10px', '-10px'],
                  opacity: [0.2, 0.7, 0.2],
                }}
                transition={{
                  duration: 6 + i * 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.4,
                }}
                className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400/40 blur-[1px]"
              />
            ))}
          </div>

          {/* ── Main Content Container ───────────────────────────────────── */}
          <div className="flex flex-col items-center justify-center z-10 space-y-9 -translate-y-6">

            {/* Glowing Logo Mark & Dual Orbit Container */}
            <div className="relative w-52 h-52 flex items-center justify-center">

              {/* Outer Orbital Ring (Clockwise) */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border border-dashed border-indigo-500/20"
              />

              {/* Inner Orbital Ring (Counter-Clockwise) */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-3 rounded-full border border-dashed border-cyan-400/15"
              />

              {/* Ambient Core Energy Aura */}
              <motion.div
                animate={{
                  scale: [0.9, 1.2, 0.9],
                  opacity: [0.4, 0.75, 0.4],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute w-28 h-28 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-500 blur-xl opacity-60"
              />

              {/* Glass Logo Card */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0, filter: 'blur(12px)' }}
                animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-28 h-28 rounded-2xl bg-[#0c0d16]/80 backdrop-blur-xl border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_12px_32px_rgba(0,0,0,0.6)] flex items-center justify-center p-4 overflow-hidden"
              >
                <img
                  src="/logo_refined.png"
                  alt="Nexora Logo"
                  className="w-full h-full object-contain filter drop-shadow-[0_0_18px_rgba(99,102,241,0.65)]"
                />
              </motion.div>
            </div>

            {/* Typography Header */}
            <div className="flex flex-col items-center justify-center space-y-2.5">
              <motion.h1
                initial={{ letterSpacing: '0.05em', opacity: 0, y: 10 }}
                animate={{ letterSpacing: '0.28em', opacity: 1, y: 0 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                className="text-5xl md:text-6xl font-black text-white uppercase select-none tracking-[0.28em] pl-[0.28em] filter drop-shadow-[0_0_24px_rgba(99,102,241,0.35)]"
              >
                NEXORA
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 0.65, y: 0 }}
                transition={{ duration: 1, delay: 0.6 }}
                className="text-xs md:text-sm font-semibold tracking-[0.4em] text-indigo-300 uppercase pl-[0.4em]"
              >
                Orchestrating the Future of Software
              </motion.p>
            </div>

            {/* Progress & Telemetry Section */}
            <div className="flex flex-col items-center justify-center space-y-4 pt-2">

              {/* Progress Bar Frame */}
              <div className="w-72 h-[4px] bg-white/5 rounded-full overflow-hidden relative border border-white/10 shadow-inner">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 via-violet-500 to-pink-500 relative"
                  style={{
                    boxShadow: '0 0 14px rgba(99, 102, 241, 0.8), 0 0 4px rgba(255, 255, 255, 0.9)',
                  }}
                />
              </div>

              {/* Monospace Telemetry & Status Pill */}
              <div className="flex items-center space-x-3 text-xs font-mono">
                {/* Status Indicator */}
                <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    {activeStage.stage}
                  </span>
                </div>

                {/* Animated Reading Text */}
                <div className="h-5 overflow-hidden flex items-center min-w-[280px]">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={activeStage.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="text-[11px] text-indigo-200/75 tracking-wider uppercase truncate"
                    >
                      {activeStage.label}
                    </motion.span>
                  </AnimatePresence>
                </div>

                {/* Percentage Counter */}
                <span className="text-[11px] text-indigo-400/80 font-bold w-9 text-right">
                  {progress}%
                </span>
              </div>

            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
