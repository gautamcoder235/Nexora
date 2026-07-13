import React, { useState, useEffect, useRef } from "react";
import { HelpCircle, AlertTriangle, X, Edit } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";

export const CustomDialog: React.FC = () => {
  const dialog = useOrchestratorStore((s) => s.dialog);
  const closeDialog = useOrchestratorStore((s) => s.closeDialog);

  const [promptValue, setPromptValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dialog && dialog.type === "prompt") {
      setPromptValue(dialog.promptDefaultValue ?? "");
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setPromptValue("");
    }
  }, [dialog]);

  if (!dialog) return null;

  const isConfirm = dialog.type === "confirm";
  const isPrompt = dialog.type === "prompt";

  const handleConfirm = () => {
    if (isPrompt && dialog.onConfirmPrompt) {
      dialog.onConfirmPrompt(promptValue);
    } else {
      dialog.onConfirm();
    }
  };

  const handleCancel = () => {
    if (dialog.onCancel) {
      dialog.onCancel();
    } else {
      closeDialog();
    }
  };

  return (
    <div className="fixed inset-0 bg-bg-primary/60 backdrop-blur-md z-[99999] flex items-center justify-center font-mono animate-in fade-in duration-200">
      <div className="glass-modal glass-noise-base w-96 p-5 space-y-4 relative flex flex-col justify-between animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          onClick={handleCancel}
          className="absolute top-3.5 right-3.5 text-text-muted hover:text-text-primary p-0.5 rounded-full hover:bg-bg-secondary/30 transition-all cursor-pointer"
        >
          <X size={14} />
        </button>

        {/* Heading */}
        <div className="flex items-center gap-2.5 pb-2 border-b border-border-glass select-none">
          {isConfirm ? (
            <HelpCircle size={16} className="text-accent-primary flex-shrink-0" />
          ) : isPrompt ? (
            <Edit size={16} className="text-accent-primary flex-shrink-0" />
          ) : (
            <AlertTriangle size={16} className="text-accent-primary flex-shrink-0" />
          )}
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
            {dialog.title}
          </h3>
        </div>

        {/* Message Body */}
        <div className="text-[11px] text-text-secondary select-text leading-relaxed py-1 min-h-[30px]">
          {dialog.message}
        </div>

        {/* Input box for prompt type */}
        {isPrompt && (
          <div className="py-1">
            <input
              ref={inputRef}
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={dialog.promptPlaceholder}
              className="glass-input glass-input--mono text-xs py-1.5 px-3 w-full bg-bg-tertiary/40 border border-border-glass hover:border-border-glass-hover focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none rounded text-text-primary transition-all font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirm();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancel();
                }
              }}
            />
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex gap-2 justify-end pt-3 border-t border-border-glass select-none">
          {(isConfirm || isPrompt) && (
            <button
              onClick={handleCancel}
              className="bg-transparent hover:bg-bg-secondary/40 text-text-muted hover:text-text-primary border border-border-glass hover:border-border-glass-hover font-bold text-[10px] uppercase py-1.5 px-4 rounded transition-all cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleConfirm}
            className="bg-accent-primary hover:bg-accent-secondary text-text-inverse font-bold text-[10px] uppercase py-1.5 px-4 rounded shadow transition-all cursor-pointer"
          >
            {isConfirm ? "Confirm" : isPrompt ? "Submit" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
};
