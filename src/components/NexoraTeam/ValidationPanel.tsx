import React, { useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { ValidationStep } from '../../types/validation';
import { CheckCircle2, XCircle, Loader2, Play, ChevronDown, ChevronRight, Clock, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const ValidationPanel: React.FC = () => {
  const { validationProfile, forceValidation, tasks } = useTeamStore();
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  if (!validationProfile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-550 p-6 select-none font-mono">
        <ShieldCheck className="w-6 h-6 mb-2 text-zinc-600 stroke-[1.5]" />
        <span className="text-[10px] text-center">No validation runs recorded for the active session.</span>
      </div>
    );
  }

  const getStepStatusIcon = (status: ValidationStep['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-[#EF4444]" />;
      case 'running':
        return <Loader2 className="w-3.5 h-3.5 text-[#3B82F6] animate-spin" />;
      case 'skipped':
        return <span className="text-[8px] font-bold font-mono px-1 rounded-md bg-[#0D0D10] text-zinc-500 border border-[#1B1B22]">SKIPPED</span>;
      default:
        return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const getOverallStatusStyle = (status: string) => {
    switch (status) {
      case 'passed':
        return 'text-[#22C55E] bg-[#22C55E]/5 border-[#22C55E]/15';
      case 'failed':
        return 'text-[#EF4444] bg-[#EF4444]/5 border-[#EF4444]/15';
      case 'running':
        return 'text-[#3B82F6] bg-[#3B82F6]/5 border-[#3B82F6]/15 animate-pulse';
      default:
        return 'text-zinc-400 bg-[#121218]/50 border-[#1B1B22]';
    }
  };

  const handleStepClick = (stepId: string) => {
    setExpandedStepId(prev => (prev === stepId ? null : stepId));
  };

  // Find a task in validation status or quarantined status to allow forcing validation
  const validationTask = tasks.find(t => t.state === 'validation' || t.state === 'quarantined');

  return (
    <div className="h-full flex flex-col font-mono text-[10px] select-text">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1B1B22] bg-[#121218]/50 flex items-center justify-between flex-shrink-0 select-none">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span className="text-xs font-bold text-zinc-350">Pipeline Validation Center</span>
        </div>
        {validationTask && (
          <button
            onClick={() => forceValidation(validationTask.id)}
            className="text-[9px] bg-[#7C5CFF] hover:bg-[#7C5CFF]/90 text-white font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shadow-lg shadow-[#7C5CFF]/15"
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            <span>Recheck Pipeline</span>
          </button>
        )}
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {/* Profile Card Summary */}
        <div className={`p-3.5 rounded-xl border flex flex-col gap-1.5 ${getOverallStatusStyle(validationProfile.overallStatus)}`}>
          <div className="flex justify-between items-start select-none">
            <span className="text-[11px] font-bold text-zinc-100">{validationProfile.name}</span>
            <span className="text-[9px] font-bold font-mono tracking-wide uppercase px-1.5 py-0.5 rounded-md border border-current bg-black/20">
              {validationProfile.overallStatus}
            </span>
          </div>
          
          <div className="flex items-center gap-3 text-[9px] text-zinc-500 mt-1 border-t border-[#1B1B22] pt-2 select-none">
            <span>Trigger: <strong className="text-zinc-300 capitalize">{validationProfile.triggerType}</strong></span>
            {validationProfile.startedAt && (
              <span>Started: <strong className="text-zinc-300">{new Date(validationProfile.startedAt).toLocaleTimeString()}</strong></span>
            )}
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold tracking-wider uppercase text-zinc-500 block mb-1 select-none">Validation Steps</span>
          
          {validationProfile.steps.map((step) => {
            const isExpanded = expandedStepId === step.id;
            const hasLogs = step.output || step.errorMessage;

            return (
              <div key={step.id} className="border border-[#1B1B22] rounded-xl bg-[#0D0D10]/35 overflow-hidden">
                {/* Step Row */}
                <button
                  onClick={() => handleStepClick(step.id)}
                  className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[#1B1B22] transition-colors focus:outline-none cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {getStepStatusIcon(step.status)}
                    <span className="text-xs font-semibold text-zinc-300 truncate">{step.name}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                    <span>{step.durationMs}ms</span>
                    {step.exitCode !== undefined && (
                      <span className="font-mono text-[9px] px-1.5 py-0.2 rounded-md bg-[#0D0D10] border border-[#1B1B22] text-zinc-400">
                        exit: {step.exitCode}
                      </span>
                    )}
                    {hasLogs && (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
                  </div>
                </button>

                {/* Step Logs Console */}
                <AnimatePresence>
                  {isExpanded && hasLogs && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="border-t border-[#1B1B22] bg-[#0D0D10]/80 p-3 text-[9px] text-zinc-300 font-mono space-y-2.5 leading-relaxed overflow-hidden"
                    >
                      {step.output && (
                        <div>
                          <div className="text-[8px] uppercase tracking-wider text-zinc-500 font-bold mb-1 select-none">Stdout</div>
                          <pre className="whitespace-pre-wrap bg-[#0D0D10] p-2.5 rounded-lg border border-[#1B1B22] text-zinc-400 selection:bg-[#7C5CFF]/30">{step.output}</pre>
                        </div>
                      )}
                      {step.errorMessage && (
                        <div>
                          <div className="text-[8px] uppercase tracking-wider text-[#EF4444] font-bold mb-1 select-none">Stderr / Error</div>
                          <pre className="whitespace-pre-wrap bg-[#EF4444]/5 p-2.5 rounded-lg border border-[#EF4444]/15 text-rose-355 selection:bg-[#EF4444]/20">{step.errorMessage}</pre>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
export default ValidationPanel;
