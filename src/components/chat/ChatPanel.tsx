import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Square, Paperclip, Plus, MessageSquare, ChevronDown, 
  Settings, X, Cpu, Loader2, Wrench, CheckCircle2, AlertCircle, Sparkles,
  Globe, Terminal, FileText, Search, GitBranch, Brain, CornerDownRight, Copy, Check, Trash2,
  Pin, PinOff, SidebarClose, Edit2, Image as ImageIcon, File as FileIcon
} from 'lucide-react';
import { useChatStore, fetchModelsForProvider } from '../../stores/chatStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { EntityMentionPicker } from './EntityMentionPicker';
import { ProgressGraph } from './ProgressGraph';
import { ConversationMessage, ToolProposal, ToolResult } from '../../core/ai/protocol';

export const ChatPanel: React.FC = () => {
  const [dynamicModels, setDynamicModels] = useState<Record<string, Array<{ id: string; name: string }>>>({});

  const {
    sessions,
    activeSessionId,
    isStreaming,
    inputValue,
    selectedModelId,
    selectedProviderId,
    isChatPanelPinned,
    setInputValue,
    sendMessage,
    stopStreaming,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    setChatPanelVisible,
    setChatPanelPinned,
    getActiveSession,
    getActiveMessages,
    getActivePhase,
    setMentionQuery,
    setMentionPickerOpen,
    switchModel
  } = useChatStore();

  const activeSession = getActiveSession();
  const messages = getActiveMessages();
  const phase = getActivePhase();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const sessionDropdownRef = useRef<HTMLDivElement>(null);

  const [isModelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [isSessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Attachment state — visual chips like ChatGPT/Claude/Gemini
  interface ChatAttachment {
    id: string;
    file: File;
    name: string;
    size: number;
    type: string;       // MIME type
    isImage: boolean;
    previewUrl?: string; // blob URL for image thumbnails
  }

  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

  // Accepted file types that AI models support
  const ACCEPTED_FILE_TYPES = [
    // Images
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents
    'application/pdf',
    // Text / Code
    'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/css',
    'application/json', 'application/xml',
    'text/x-python', 'text/javascript', 'text/typescript',
    'application/x-yaml',
  ].join(',');

  const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.txt,.md,.csv,.html,.css,.json,.xml,.py,.js,.jsx,.ts,.tsx,.yaml,.yml,.rs,.go,.java,.c,.cpp,.h,.hpp,.rb,.sh,.toml,.env,.cfg,.ini,.log';

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
      if (sessionDropdownRef.current && !sessionDropdownRef.current.contains(event.target as Node)) {
        setSessionDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      attachments.forEach(a => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, []);

  const DEFAULT_PROVIDER_GROUPS = [
    {
      providerId: 'openai',
      providerName: 'OpenAI',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'o3-mini', name: 'o3-mini' },
      ]
    },
    {
      providerId: 'anthropic',
      providerName: 'Anthropic',
      models: [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      ]
    },
    {
      providerId: 'google',
      providerName: 'Google Gemini',
      models: [
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
      ]
    },
    {
      providerId: 'deepseek',
      providerName: 'DeepSeek',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3' },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1' },
      ]
    },
    {
      providerId: 'ollama',
      providerName: 'Ollama (Local)',
      models: [
        { id: 'llama3', name: 'Llama 3' },
        { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
      ]
    },
    {
      providerId: 'lmstudio',
      providerName: 'LM Studio (Local)',
      models: [
        { id: 'local-model', name: 'LM Studio Loaded Model' },
      ]
    }
  ];

  // Fetch live models for each provider when API keys exist
  useEffect(() => {
    DEFAULT_PROVIDER_GROUPS.forEach(async (group) => {
      const fetched = await fetchModelsForProvider(group.providerId);
      if (fetched && fetched.length > 0) {
        setDynamicModels(prev => ({ ...prev, [group.providerId]: fetched }));
      }
    });
  }, []);

  const PROVIDER_GROUPS = DEFAULT_PROVIDER_GROUPS.map(group => ({
    ...group,
    models: dynamicModels[group.providerId] || group.models
  }));

  // Auto-create initial session if none exists on mount
  useEffect(() => {
    if (sessions.length === 0) {
      createSession('workspace-1');
    }
  }, [sessions.length, createSession]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isStreaming]);

  // Handle Input text area grow
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputValue(val);

    const lastWord = val.split(/[\s\n]+/).pop() || '';
    if (lastWord.startsWith('@')) {
      setMentionQuery(lastWord.slice(1));
      setMentionPickerOpen(true);
    } else {
      setMentionPickerOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((inputValue.trim() || attachments.length > 0) && !isStreaming) {
        handleSendWithAttachments();
      }
    }
  };

  const handleMentionSelect = (mention: string) => {
    const words = inputValue.split(/[\s\n]+/);
    words.pop();
    const newValue = [...words, `@${mention} `].join(' ');
    setInputValue(newValue);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleAttachmentClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setAttachments(prev => {
      const existingKeys = new Set(prev.map(a => `${a.name}::${a.size}`));
      const newAttachments: ChatAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const key = `${file.name}::${file.size}`;
        if (existingKeys.has(key)) continue; // skip duplicates
        existingKeys.add(key);

        const isImage = file.type.startsWith('image/');
        newAttachments.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          isImage,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        });
      }

      return [...prev, ...newAttachments];
    });

    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const toRemove = prev.find(a => a.id === id);
      if (toRemove?.previewUrl) URL.revokeObjectURL(toRemove.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSendWithAttachments = async () => {
    const text = inputValue.trim();
    if (!text && attachments.length === 0) return;

    // Build structured attachment data with base64 for images
    const attachmentData: any[] = [];

    for (const attachment of attachments) {
      if (attachment.isImage) {
        // Read image file as base64 for API transmission
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Strip data URL prefix: "data:image/png;base64,..."
            const base64Data = result.split(',')[1] || '';
            resolve(base64Data);
          };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(attachment.file);
        });

        attachmentData.push({
          name: attachment.name,
          size: attachment.size,
          type: attachment.type,
          isImage: true,
          base64,
        });
      } else {
        // For text/code files, read as text
        const textContent = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string || '');
          reader.onerror = () => resolve('');
          reader.readAsText(attachment.file);
        });

        attachmentData.push({
          name: attachment.name,
          size: attachment.size,
          type: attachment.type,
          isImage: false,
          textContent,
        });
      }
    }

    // Build display text (text + file names for context)
    let messageContent = text;
    if (attachmentData.length > 0) {
      const attachmentNames = attachmentData.map(a => a.name).join(', ');
      if (!messageContent) {
        messageContent = `[Attached: ${attachmentNames}]`;
      }
    }

    sendMessage(messageContent, attachmentData);

    // Clean up blob URLs
    attachments.forEach(a => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  };

  const formatTokens = (tokens?: number) => {
    if (!tokens) return '0';
    return tokens > 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toString();
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-primary)]/95 text-zinc-100 font-sans shadow-2xl relative select-none rounded-[inherit] overflow-hidden">
      {/* Header - Glassmorphism */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg-secondary)]/90 backdrop-blur-xl border-b border-[var(--border-glass)] z-20">
        
        {/* Model Selector */}
        <div ref={modelDropdownRef} className="relative">
          <button 
            onClick={() => setModelDropdownOpen(!isModelDropdownOpen)}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border-glass)] border border-[var(--border-glass)] transition-all text-xs font-mono text-[var(--accent-primary)] shadow-sm cursor-pointer"
          >
            <Cpu size={14} className="text-[var(--accent-primary)]" />
            <span className="font-semibold">{selectedModelId}</span>
            <ChevronDown size={12} className="text-zinc-500" />
          </button>
          
          {isModelDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-56 max-h-72 overflow-y-auto bg-[var(--bg-secondary)]/98 border border-[var(--border-glass)] rounded-xl shadow-2xl py-1.5 z-50 backdrop-blur-xl font-mono text-xs animate-in fade-in duration-150 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {PROVIDER_GROUPS.map((group, groupIdx) => (
                <div key={group.providerId} className={groupIdx > 0 ? "border-t border-[var(--border-glass)] mt-1 pt-1.5" : ""}>
                  <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                    {group.providerName}
                  </div>
                  {group.models.map((model: { id: string; name: string }) => {
                    const isActive = selectedModelId === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          switchModel(model.id, group.providerId);
                          setModelDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer ${
                          isActive 
                            ? 'bg-[rgba(var(--accent-primary-rgb),0.12)] text-[var(--accent-primary)] font-semibold' 
                            : 'text-zinc-300 hover:bg-[var(--border-glass)]'
                        }`}
                      >
                        <span>{model.name}</span>
                        {isActive && (
                          <span className="text-[9px] text-emerald-400 border border-emerald-500/20 px-1 rounded">Active</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Center - Session Info */}
        <div className="flex flex-col items-center">
          <div ref={sessionDropdownRef} className="relative">
            <button 
              onClick={() => setSessionDropdownOpen(!isSessionDropdownOpen)}
              className="flex items-center space-x-1.5 text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
            >
              <span className="truncate max-w-[140px]">{activeSession?.name || 'AI Chat Session'}</span>
              <ChevronDown size={12} className="text-zinc-500" />
            </button>
            
            {isSessionDropdownOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-64 bg-[var(--bg-secondary)]/98 border border-[var(--border-glass)] rounded-xl shadow-2xl py-1.5 z-50 backdrop-blur-xl animate-in fade-in duration-150">
                <div className="flex items-center justify-between px-3 pb-1.5 mb-1 border-b border-[var(--border-glass)]">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold tracking-wider">Recent Conversations</span>
                  <button 
                    onClick={() => {
                      createSession('workspace-1');
                      setSessionDropdownOpen(false);
                    }}
                    className="p-1 hover:bg-[var(--border-glass)] rounded text-[var(--accent-primary)] transition-colors"
                    title="New Chat Session"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5 px-1 scrollbar-none">
                  {sessions.length === 0 ? (
                    <div className="p-3 text-center text-xs text-zinc-500 font-mono">
                      <p className="mb-2">No active sessions</p>
                      <button
                        onClick={() => {
                          createSession('workspace-1');
                          setSessionDropdownOpen(false);
                        }}
                        className="px-3 py-1 bg-[rgba(var(--accent-primary-rgb),0.12)] border border-[rgba(var(--accent-primary-rgb),0.3)] text-[var(--accent-primary)] rounded-lg text-[11px] hover:bg-[rgba(var(--accent-primary-rgb),0.2)] transition-colors cursor-pointer"
                      >
                        + Start New Chat
                      </button>
                    </div>
                  ) : (
                    sessions.map(s => (
                      <div key={s.id} className="group relative flex items-center px-1">
                        {editingSessionId === s.id ? (
                          <div className="flex items-center space-x-1.5 w-full py-1 px-2 bg-[var(--bg-tertiary)] border border-[var(--accent-primary)] rounded-lg">
                            <MessageSquare size={13} className="text-[var(--accent-primary)] flex-shrink-0" />
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editingName.trim()) {
                                    renameSession(s.id, editingName.trim());
                                  }
                                  setEditingSessionId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingSessionId(null);
                                }
                              }}
                              autoFocus
                              className="flex-1 bg-transparent text-xs text-zinc-100 outline-none font-sans min-w-0"
                            />
                            <button
                              onClick={() => {
                                if (editingName.trim()) {
                                  renameSession(s.id, editingName.trim());
                                }
                                setEditingSessionId(null);
                              }}
                              className="p-0.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                              title="Save Name"
                            >
                              <Check size={12} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button 
                              onClick={() => {
                                selectSession(s.id);
                                setSessionDropdownOpen(false);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                                s.id === activeSessionId 
                                  ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-primary-rgb),0.12)] border border-[rgba(var(--accent-primary-rgb),0.2)] font-semibold' 
                                  : 'text-zinc-300 hover:bg-[var(--border-glass)]'
                              }`}
                            >
                              <div className="flex items-center space-x-2 truncate min-w-0 pr-2">
                                <MessageSquare size={13} className="flex-shrink-0" />
                                <span className="truncate">{s.name}</span>
                              </div>
                              {s.id === activeSessionId && (
                                <span className="text-[9px] text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded flex-shrink-0 group-hover:opacity-0 transition-opacity duration-150">
                                  Active
                                </span>
                              )}
                            </button>
                            <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 absolute right-2 bg-[var(--bg-secondary)] px-1 rounded transition-all">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingSessionId(s.id);
                                  setEditingName(s.name);
                                }}
                                className="p-1 text-zinc-400 hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
                                title="Rename Conversation"
                              >
                                <Edit2 size={12} />
                              </button>
                              {sessions.length > 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSession(s.id);
                                  }}
                                  className="p-1 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                                  title="Delete Session"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-0.5">
          <button 
            onClick={() => createSession('workspace-1')}
            className="p-1.5 hover:bg-[var(--border-glass)] rounded-lg text-zinc-400 hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
            title="New Chat Session"
          >
            <Plus size={16} />
          </button>
          <button 
            onClick={() => {
              useOrchestratorStore.getState().setSettingsModalOpen(true, 'ai_runtime');
            }}
            className="p-1.5 hover:bg-[var(--border-glass)] rounded-lg text-zinc-400 hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
            title="AI Runtime Kernel Settings"
          >
            <Settings size={16} />
          </button>
          <button 
            onClick={() => setChatPanelPinned(!isChatPanelPinned)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isChatPanelPinned 
                ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-primary-rgb),0.12)] border border-[rgba(var(--accent-primary-rgb),0.3)]' 
                : 'text-zinc-400 hover:bg-[var(--border-glass)] hover:text-zinc-200'
            }`}
            title={isChatPanelPinned ? 'Unpin Panel (Float)' : 'Pin Panel (Dock)'}
          >
            {isChatPanelPinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
        </div>
      </div>

      {/* Progress Graph (if not idle) */}
      {phase !== 'idle' && (
        <div className="bg-[var(--bg-secondary)]/60 border-b border-[var(--border-glass)]">
          <ProgressGraph phase={phase} />
        </div>
      )}

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-3.5 select-none">
            <div className="w-14 h-14 rounded-2xl bg-[rgba(var(--accent-primary-rgb),0.08)] border border-[rgba(var(--accent-primary-rgb),0.2)] flex items-center justify-center shadow-inner">
              <Sparkles size={26} className="text-[var(--accent-primary)] animate-pulse" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-zinc-200">Nexora AI Runtime Kernel</p>
              <p className="text-xs text-zinc-500 max-w-[240px]">Ask a question, request code modifications, or inspect project context using <span className="font-mono text-[var(--accent-primary)]">@</span> mentions.</p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble key={msg.id || idx} message={msg} />
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-[var(--bg-secondary)]/95 backdrop-blur-xl border-t border-[var(--border-glass)] relative">
        <EntityMentionPicker onSelect={handleMentionSelect} />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={`${ACCEPTED_FILE_TYPES},${ACCEPTED_EXTENSIONS}`}
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <div className="relative flex flex-col bg-[var(--bg-tertiary)]/90 border border-[var(--border-glass)] focus-within:border-[rgba(var(--accent-primary-rgb),0.5)] focus-within:shadow-[0_0_15px_rgba(var(--accent-primary-rgb),0.1)] rounded-xl transition-all">
          
          {/* Attachment Chips — shown above input like ChatGPT/Claude */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2.5 pt-2.5 pb-1">
              {attachments.map((attachment) => (
                <div 
                  key={attachment.id}
                  className="group/chip relative flex items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-glass)] hover:border-[rgba(var(--accent-primary-rgb),0.3)] rounded-lg px-2 py-1.5 transition-all max-w-[200px]"
                >
                  {/* Thumbnail or Icon */}
                  {attachment.isImage && attachment.previewUrl ? (
                    <div className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0 border border-[var(--border-glass)]">
                      <img 
                        src={attachment.previewUrl} 
                        alt={attachment.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-md flex-shrink-0 bg-[var(--bg-tertiary)] border border-[var(--border-glass)] flex items-center justify-center">
                      <FileIcon size={14} className="text-zinc-400" />
                    </div>
                  )}
                  
                  {/* File Info */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[10px] text-zinc-200 font-medium truncate leading-tight">
                      {attachment.name}
                    </span>
                    <span className="text-[9px] text-zinc-500 leading-tight">
                      {formatFileSize(attachment.size)}
                    </span>
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-zinc-700 hover:bg-rose-500 border border-zinc-600 hover:border-rose-400 rounded-full flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-all cursor-pointer shadow-lg"
                    title="Remove"
                  >
                    <X size={8} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Row */}
          <div className="flex items-end gap-2 p-2">
            <button 
              type="button"
              onClick={handleAttachmentClick}
              className="p-1.5 text-zinc-500 hover:text-[var(--accent-primary)] transition-colors rounded-lg flex-shrink-0 cursor-pointer"
              title="Attach Images & Files"
            >
              <Paperclip size={16} />
            </button>
            
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message Nexora AI... (Type @ to mention)"
              className="flex-1 max-h-[180px] bg-transparent text-xs text-zinc-100 placeholder-zinc-500 resize-none outline-none py-1.5 font-sans leading-relaxed scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] overflow-y-auto"
              rows={1}
            />

            {isStreaming ? (
              <button 
                onClick={stopStreaming}
                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg flex-shrink-0 transition-colors cursor-pointer"
                title="Stop Generation"
              >
                <Square size={16} className="fill-current" />
              </button>
            ) : (
              <button 
                onClick={handleSendWithAttachments}
                disabled={!inputValue.trim() && attachments.length === 0}
                className="p-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--text-inverse)] disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg flex-shrink-0 transition-all shadow cursor-pointer disabled:cursor-not-allowed"
                title="Send Message"
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
        
        {/* Phase Badge */}
        {phase !== 'idle' && (
          <div className={`absolute -top-3 left-1/2 -translate-x-1/2 flex items-center space-x-1.5 bg-[var(--bg-secondary)] border px-3 py-0.5 rounded-full shadow-lg text-[10px] font-mono ${
            phase === 'completed' 
              ? 'border-emerald-500/40 text-emerald-400' 
              : phase === 'failed' 
              ? 'border-rose-500/40 text-rose-400' 
              : 'border-[rgba(var(--accent-primary-rgb),0.3)] text-[var(--accent-primary)]'
          }`}>
            {phase === 'completed' ? (
              <CheckCircle2 size={11} className="text-emerald-400" />
            ) : phase === 'failed' ? (
              <AlertCircle size={11} className="text-rose-400" />
            ) : (
              <Loader2 size={11} className="animate-spin" />
            )}
            <span className="capitalize">{phase.replace('_', ' ')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────

const MessageBubble: React.FC<{ message: ConversationMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  
  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span className="px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border-glass)] rounded-full text-[10px] font-mono text-zinc-400">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex w-full space-x-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-[rgba(var(--accent-primary-rgb),0.1)] border border-[rgba(var(--accent-primary-rgb),0.2)] flex flex-shrink-0 items-center justify-center mt-1 text-[var(--accent-primary)]">
          <Cpu size={14} />
        </div>
      )}

      {/* Message Content Container */}
      <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'} space-y-2`}>
        
        {/* User Message */}
        {isUser ? (
          <div className="px-4 py-2.5 text-xs leading-relaxed shadow-sm font-sans bg-[rgba(var(--accent-primary-rgb),0.15)] border border-[rgba(var(--accent-primary-rgb),0.3)] text-zinc-100 rounded-2xl rounded-tr-xs font-medium">
            <MarkdownRenderer content={message.content} />
          </div>
        ) : (
          /* Assistant Unified Card (Thinking & Output joined in one card) */
          <div className="w-full bg-[var(--bg-secondary)]/90 border border-[var(--border-glass)] rounded-2xl rounded-tl-xs p-3.5 space-y-3 shadow-md backdrop-blur-md">
            {/* Thinking Process (Collapsible section at top of card) */}
            {message.thinking && (
              <details className="w-full text-[11px] text-zinc-400 bg-[var(--bg-tertiary)]/90 border border-[var(--border-glass)] rounded-xl overflow-hidden group">
                <summary className="px-3 py-1.5 cursor-pointer hover:bg-[var(--border-glass)] flex items-center space-x-2 select-none font-mono text-[10px] text-zinc-400">
                  <ChevronDown size={12} className="group-open:-rotate-180 transition-transform text-[var(--accent-primary)]" />
                  <span>Thinking Process</span>
                </summary>
                <div className="p-3 pt-1 border-t border-[var(--border-glass)] font-mono text-[11px] text-zinc-400 italic opacity-85 whitespace-pre-wrap leading-relaxed">
                  {message.thinking}
                </div>
              </details>
            )}

            {/* Answer Content or Streaming Indicator */}
            {message.content ? (
              <div className="text-xs leading-relaxed font-sans text-zinc-200">
                <MarkdownRenderer content={message.content} />
              </div>
            ) : message.streaming ? (
              <div className="flex space-x-1.5 items-center h-4 py-1">
                <span className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : null}
          </div>
        )}

        {/* Tool Cards */}
        {message.toolProposals?.map(tool => {
          const result = message.toolResults?.find(r => r.proposalId === tool.id);
          return <ToolCallCard key={tool.id} tool={tool} result={result} />;
        })}
      </div>
    </div>
  );
};

// ─── Tool Helpers & Sub-components ──────────────────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  'browser.open': 'Open Web Browser',
  'browser.screenshot': 'Capture Browser Screenshot',
  'browser.navigate': 'Navigate Browser',
  'terminal.exec': 'Execute Terminal Command',
  'terminal.stop': 'Stop Terminal Session',
  'agent.spawn': 'Spawn Agent Session',
  'agent.message': 'Send Message to Agent',
  'agent.kill': 'Kill Agent Session',
  'file.read': 'Read File',
  'file.write': 'Write File',
  'file.list': 'List Files',
  'file.delete': 'Delete File',
  'workspace.search': 'Search Workspace Files',
  'search.code': 'Search Codebase',
  'search.files': 'Search Files',
  'git.status': 'Check Git Status',
  'git.diff': 'View Git Diff',
  'git.commit': 'Create Git Commit',
  'memory.store': 'Store Knowledge Memory',
  'memory.recall': 'Recall Memory',
  'diagnostic.run': 'Run Diagnostics',
};

const capitalizeWord = (str: string): string =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

const formatToolName = (toolId: string): string => {
  if (TOOL_NAME_MAP[toolId]) {
    return TOOL_NAME_MAP[toolId];
  }

  const parts = toolId.split('.');
  if (parts.length === 2) {
    const namespace = capitalizeWord(parts[0]);
    const action = parts[1].split(/[_|-]/).map(capitalizeWord).join(' ');
    return `${action} (${namespace})`;
  }

  return toolId
    .split(/[._-]/)
    .map(capitalizeWord)
    .join(' ');
};

const getToolIcon = (toolId: string) => {
  const lower = toolId.toLowerCase();
  if (lower.startsWith('browser')) return <Globe size={14} className="text-cyan-400" />;
  if (lower.startsWith('terminal') || lower.startsWith('agent')) return <Terminal size={14} className="text-amber-400" />;
  if (lower.startsWith('file') || lower.startsWith('workspace')) return <FileText size={14} className="text-blue-400" />;
  if (lower.startsWith('search')) return <Search size={14} className="text-purple-400" />;
  if (lower.startsWith('git')) return <GitBranch size={14} className="text-orange-400" />;
  if (lower.startsWith('memory')) return <Brain size={14} className="text-emerald-400" />;
  return <Wrench size={14} className="text-[var(--accent-primary)]" />;
};

const ToolCallCard: React.FC<{ tool: ToolProposal; result?: ToolResult }> = ({ tool, result }) => {
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [isOutputExpanded, setIsOutputExpanded] = useState(true);

  const isPending = !result;
  const isSuccess = result?.status === 'success';
  const isError = result?.status === 'error' || result?.status === 'denied' || result?.status === 'cancelled';

  const handleCopyOutput = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  let argsObj: Record<string, unknown> = {};
  if (typeof tool.arguments === 'object' && tool.arguments !== null) {
    argsObj = tool.arguments;
  } else if (typeof tool.arguments === 'string') {
    try {
      argsObj = JSON.parse(tool.arguments);
    } catch {
      argsObj = { raw: tool.arguments };
    }
  }

  const argEntries = Object.entries(argsObj);

  return (
    <div className="w-full bg-[var(--bg-secondary)]/90 border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)] rounded-xl p-3.5 flex flex-col space-y-3 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-glass)] pb-2.5">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-glass)] flex items-center justify-center shadow-inner">
            {getToolIcon(tool.toolId)}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-zinc-100 font-sans tracking-wide">
              {formatToolName(tool.toolId)}
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {tool.toolId}
            </span>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center space-x-1.5">
          {isPending && (
            <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-[rgba(var(--accent-primary-rgb),0.1)] border border-[rgba(var(--accent-primary-rgb),0.3)] text-[10px] font-mono text-[var(--accent-primary)]">
              <Loader2 size={11} className="animate-spin" />
              <span>Running...</span>
            </span>
          )}
          {isSuccess && (
            <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-400">
              <CheckCircle2 size={11} />
              <span>{result?.durationMs != null ? `${result.durationMs}ms` : 'Completed'}</span>
            </span>
          )}
          {isError && (
            <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-[10px] font-mono text-rose-400">
              <AlertCircle size={11} />
              <span className="capitalize">{result?.status || 'Failed'}</span>
              {result?.durationMs != null && <span className="opacity-75">({result.durationMs}ms)</span>}
            </span>
          )}
        </div>
      </div>

      {/* Arguments Section */}
      {argEntries.length > 0 && (
        <div className="flex flex-col space-y-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
            Arguments
          </span>
          <div className="bg-[var(--bg-tertiary)]/90 border border-[var(--border-glass)] rounded-lg p-2.5 space-y-2">
            {argEntries.map(([key, val]) => (
              <div key={key} className="flex flex-col text-xs space-y-1 font-mono">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-[11px] text-[var(--accent-primary)] font-semibold">{key}:</span>
                  {val === null || val === undefined ? (
                    <span className="text-zinc-500 italic text-[11px]">null</span>
                  ) : typeof val === 'boolean' ? (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${val ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'}`}>
                      {val ? 'true' : 'false'}
                    </span>
                  ) : typeof val === 'number' ? (
                    <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-[11px]">
                      {val}
                    </span>
                  ) : typeof val === 'string' && !val.includes('\n') && val.length < 60 ? (
                    <span className="text-zinc-200 bg-[var(--bg-secondary)] border border-[var(--border-glass)] px-2 py-0.5 rounded text-[11px] break-all">
                      {val}
                    </span>
                  ) : null}
                </div>
                {(typeof val === 'object' && val !== null) || (typeof val === 'string' && (val.includes('\n') || val.length >= 60)) ? (
                  <div className="text-[11px] text-zinc-300 bg-[var(--bg-tertiary)] border border-[var(--border-glass)] rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-40 leading-relaxed scrollbar-thin">
                    {typeof val === 'string' ? val : JSON.stringify(val, null, 2)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Details */}
      {isError && result?.error && (
        <div className="bg-rose-950/30 border border-rose-900/40 rounded-lg p-2.5 flex items-start space-x-2 text-rose-300 text-[11px] font-mono">
          <AlertCircle size={13} className="text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 whitespace-pre-wrap leading-relaxed">
            {result.error}
          </div>
        </div>
      )}

      {/* Execution Output Container */}
      {result && result.output && result.output.trim().length > 0 && (
        <div className="flex flex-col space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
            <button 
              onClick={() => setIsOutputExpanded(!isOutputExpanded)}
              className="flex items-center space-x-1.5 hover:text-zinc-200 transition-colors cursor-pointer select-none"
            >
              <CornerDownRight size={12} className="text-[var(--accent-primary)]" />
              <span>Execution Output</span>
              <ChevronDown size={12} className={`transition-transform duration-150 ${isOutputExpanded ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => handleCopyOutput(result.output)}
              className="flex items-center space-x-1 hover:text-[var(--accent-primary)] transition-colors cursor-pointer text-zinc-500 select-none"
              title="Copy Output"
            >
              {copiedOutput ? (
                <>
                  <Check size={11} className="text-emerald-400" />
                  <span className="text-emerald-400 text-[9px]">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={11} />
                  <span className="text-[9px]">Copy</span>
                </>
              )}
            </button>
          </div>

          {isOutputExpanded && (
            <div className="text-[11px] font-mono text-zinc-200 bg-[var(--bg-tertiary)] border border-[var(--border-glass)] rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap max-h-56 leading-relaxed scrollbar-thin shadow-inner">
              {result.output}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Markdown Renderer Sub-components ────────────────────────────────────────

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 bg-[var(--bg-tertiary)] border border-[var(--border-glass)] rounded-xl overflow-hidden shadow-lg font-mono">
      <div className="flex items-center justify-between px-3 py-1 bg-[var(--bg-secondary)] border-b border-[var(--border-glass)] text-[10px] text-zinc-400 select-none">
        <span className="uppercase tracking-wider font-semibold text-[var(--accent-primary)]">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 text-[11px] text-zinc-200 overflow-x-auto whitespace-pre leading-relaxed scrollbar-none [&::-webkit-scrollbar]:hidden">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const renderInlineFormatting = (text: string): React.ReactNode => {
  // Split inline code first: `code`
  const codeParts = text.split(/(`[^`]+`)/g);

  return codeParts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const codeText = part.slice(1, -1);
      return (
        <code key={idx} className="bg-[var(--bg-tertiary)] text-[var(--accent-primary)] border border-[var(--border-glass)] px-1.5 py-0.5 rounded font-mono text-[11px] mx-0.5">
          {codeText}
        </code>
      );
    }

    // Process bold: **text** or __text__
    const boldParts = part.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
    return boldParts.map((bPart, bIdx) => {
      if ((bPart.startsWith('**') && bPart.endsWith('**')) || (bPart.startsWith('__') && bPart.endsWith('__'))) {
        const boldText = bPart.slice(2, -2);
        return <strong key={`${idx}-${bIdx}`} className="font-bold text-zinc-100">{boldText}</strong>;
      }
      return bPart;
    });
  });
};

const renderFormattedText = (text: string, keyPrefix: string) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<div key={`${keyPrefix}-blank-${lineIdx}`} className="h-1" />);
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={`${keyPrefix}-h3-${lineIdx}`} className="text-xs font-bold text-zinc-100 mt-2 mb-1 border-b border-[var(--border-glass)] pb-1 font-sans">
          {renderInlineFormatting(trimmed.slice(4))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={`${keyPrefix}-h2-${lineIdx}`} className="text-xs font-bold text-zinc-100 mt-2 mb-1 font-sans">
          {renderInlineFormatting(trimmed.slice(3))}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={`${keyPrefix}-h1-${lineIdx}`} className="text-xs font-bold text-[var(--accent-primary)] mt-2.5 mb-1 font-sans">
          {renderInlineFormatting(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    // Lists
    const listMatch = trimmed.match(/^(\d+\.|\-|\*)\s+(.*)/);
    if (listMatch) {
      const prefix = listMatch[1];
      const rest = listMatch[2];
      const isNumbered = /^\d+\./.test(prefix);

      elements.push(
        <div key={`${keyPrefix}-list-${lineIdx}`} className="flex items-start space-x-2 my-0.5 pl-1 text-xs leading-relaxed">
          <span className="font-mono text-[var(--accent-primary)] font-semibold select-none flex-shrink-0">
            {isNumbered ? prefix : '•'}
          </span>
          <span className="flex-1 text-zinc-200">
            {renderInlineFormatting(rest)}
          </span>
        </div>
      );
      return;
    }

    // Paragraph
    elements.push(
      <p key={`${keyPrefix}-p-${lineIdx}`} className="text-xs leading-relaxed text-zinc-200">
        {renderInlineFormatting(line)}
      </p>
    );
  });

  return <div key={keyPrefix} className="space-y-1">{elements}</div>;
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;

  // Split by code blocks first
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(renderFormattedText(textBefore, `text-${lastIndex}`));
    }

    const lang = match[1] || 'code';
    const code = match[2].trimEnd();
    const blockKey = `code-${match.index}`;

    parts.push(
      <CodeBlock key={blockKey} language={lang} code={code} />
    );

    lastIndex = match.index + match[0].length;
  }

  const remainingText = content.substring(lastIndex);
  if (remainingText) {
    parts.push(renderFormattedText(remainingText, `text-${lastIndex}`));
  }

  return <div className="space-y-1">{parts}</div>;
};

export default ChatPanel;
