import React, { useState, useRef, useEffect } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { AgentMessage } from '../../types/agent';
import { Send, User, Bot, AlertTriangle, ShieldCheck, Sparkles, MessageSquare, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const TeamChat: React.FC = () => {
  const { messages, nodes, sendDirective, clearAllMessages, defaultInstructions, broadcastDefaultInstructions } = useTeamStore();
  const [inputText, setInputText] = useState('');
  const [targetAgent, setTargetAgent] = useState<string>('all');
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const agentId = targetAgent === 'all' ? null : targetAgent;
    sendDirective(agentId, inputText);
    setInputText('');
  };

  const getMessageStyle = (sender: AgentMessage['sender']) => {
    switch (sender) {
      case 'user':
        return 'bg-[#7C5CFF]/10 border-[#7C5CFF]/20 text-zinc-100 ml-16';
      case 'system':
        return 'bg-[#0D0D10] border-[#1B1B22] text-zinc-500 text-[10px] italic mx-4 text-center py-2';
      default:
        return 'bg-[#121218]/80 border-[#1B1B22] text-zinc-200 mr-16';
    }
  };

  return (
    <div className="flex flex-col h-full rounded-2xl border border-[#1B1B22] bg-[#121218]/30 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-5 py-2.5 border-b border-[#1B1B22] bg-[#121218]/80 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span className="text-xs font-bold font-mono tracking-wider uppercase text-zinc-400">Team Communication Log</span>
        </div>
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => {
              useOrchestratorStore.getState().showConfirmDialog(
                "Clear Log",
                "Are you sure you want to clear the team communication log?",
                () => {
                  clearAllMessages();
                }
              );
            }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#1B1B22] bg-[#1A1A24]/30 text-[10px] font-mono text-zinc-400 hover:text-red-400 hover:border-red-950/50 hover:bg-red-950/20 transition-all active:scale-95"
            title="Clear Communication Log"
          >
            <Trash2 className="w-3 h-3 text-zinc-500 hover:text-red-400 transition-colors" />
            <span>Clear</span>
          </button>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Live telemetry feed</span>
          </div>
        </div>
      </div>

      {/* Messages Feed */}
      <div ref={feedRef} className="flex-1 p-4 overflow-y-auto space-y-3 min-h-0 select-text">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isSystem = msg.sender === 'system';

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`p-3.5 rounded-xl border text-xs leading-relaxed flex gap-3 items-start ${getMessageStyle(
                  msg.sender
                )}`}
              >
                {/* Sender Icon */}
                {!isSystem && (
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                    isUser 
                      ? 'bg-[#7C5CFF]/20 text-[#7C5CFF] border-[#7C5CFF]/30' 
                      : 'bg-[#0D0D10] text-zinc-400 border-[#1B1B22]'
                  }`}>
                    {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                )}

                {/* Message Body */}
                <div className="flex-1 min-w-0">
                  {!isSystem && (
                    <div className="flex justify-between items-center mb-1 select-none">
                      <span className="font-semibold text-zinc-200">
                        {isUser ? 'Operator Directive' : msg.senderName || 'Agent Telemetry'}
                      </span>
                      <span className="text-[9px] text-zinc-500 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-zinc-300 selection:bg-[#7C5CFF]/30">{msg.content}</div>
                  
                  {/* Associated block reference */}
                  {msg.blockId && (
                    <div className="mt-2 pt-2 border-t border-[#1B1B22] flex items-center gap-1 text-[9px] text-[#22C55E] font-mono select-none">
                      <ShieldCheck className="w-3 h-3" /> 
                      <span>Log verification block: {msg.blockId}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Input Action Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-[#1B1B22] bg-[#121218]/50 flex items-center gap-3">
        <div className="flex flex-col gap-2 flex-1">
          {/* Target Selector & Quick Action */}
          <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 select-none">
            <div className="flex items-center gap-2">
              <span>Direct Intervention To:</span>
              <select
                value={targetAgent}
                onChange={(e) => setTargetAgent(e.target.value)}
                className="bg-[#0D0D10] border border-[#1B1B22] rounded-md px-2 py-0.5 text-[9px] font-semibold text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/50 cursor-pointer"
              >
                <option value="all">Global Broadcast</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label} ({node.role})
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const selectedNode = nodes.find(n => n.id === targetAgent);
              const roleInst = selectedNode ? (defaultInstructions[selectedNode.role] || '') : '';
              const isEnabled = targetAgent === 'all'
                ? Object.values(defaultInstructions).some(inst => inst && inst.trim().length > 0)
                : roleInst.trim().length > 0;
              const title = targetAgent === 'all'
                ? "Broadcast role-specific default instructions to active terminals"
                : `Send default ${selectedNode?.role} instructions to this agent`;

              return isEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    if (targetAgent === 'all') {
                      broadcastDefaultInstructions();
                    } else {
                      sendDirective(targetAgent, roleInst);
                    }
                  }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#7C5CFF]/20 bg-[#7C5CFF]/5 text-[9px] font-semibold text-[#9C82FF] hover:bg-[#7C5CFF]/15 transition-all active:scale-95 cursor-pointer"
                  title={title}
                >
                  <Sparkles className="w-3 h-3 text-[#9C82FF]" />
                  <span>Quick-Send Default</span>
                </button>
              ) : null;
            })()}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={targetAgent === 'all' 
                ? "Enter High Priority Directive to broadcast..." 
                : `Command ${nodes.find(n => n.id === targetAgent)?.label || 'Agent'}...`
              }
              className="flex-1 bg-[#0D0D10] border border-[#1B1B22] rounded-lg px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#7C5CFF]/50 transition-colors"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="h-9 px-3.5 rounded-lg bg-[#7C5CFF] hover:bg-[#7C5CFF]/90 text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-[#7C5CFF]/15"
              title="Dispatch High-Priority Directive"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
export default TeamChat;
