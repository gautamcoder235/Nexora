import React from "react";
import { HelpCircle, AlertTriangle, X } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";

export const CustomDialog: React.FC = () => {
  const dialog = useOrchestratorStore((s) => s.dialog);
  const closeDialog = useOrchestratorStore((s) => s.closeDialog);

  if (!dialog) return null;

  const isConfirm = dialog.type === "confirm";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center font-mono animate-in fade-in duration-200">
      <div className="bg-[#0e0e12]/95 border border-[#232329] w-96 rounded-xl p-5 shadow-2xl space-y-4 relative flex flex-col justify-between animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          onClick={closeDialog}
          className="absolute top-3.5 right-3.5 text-zinc-500 hover:text-zinc-200 p-0.5 rounded-full hover:bg-zinc-800/30 transition-all cursor-pointer"
        >
          <X size={14} />
        </button>

        {/* Heading */}
        <div className="flex items-center gap-2.5 pb-2 border-b border-[#232329]/50 select-none">
          {isConfirm ? (
            <HelpCircle size={16} className="text-purple-400 flex-shrink-0" />
          ) : (
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
          )}
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            {dialog.title}
          </h3>
        </div>

        {/* Message Body */}
        <div className="text-[11px] text-zinc-400 select-text leading-relaxed py-1 min-h-[40px]">
          {dialog.message}
        </div>

        {/* Footer Actions */}
        <div className="flex gap-2 justify-end pt-3 border-t border-[#232329]/50 select-none">
          {isConfirm && (
            <button
              onClick={() => {
                if (dialog.onCancel) {
                  dialog.onCancel();
                } else {
                  closeDialog();
                }
              }}
              className="bg-transparent hover:bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 border border-[#232329] hover:border-zinc-700 font-bold text-[10px] uppercase py-1.5 px-4 rounded transition-all cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            onClick={dialog.onConfirm}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] uppercase py-1.5 px-4 rounded shadow-md transition-all cursor-pointer"
          >
            {isConfirm ? "Confirm" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
};
