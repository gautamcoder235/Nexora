import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FilePlus, Save, Trash2, FileText, MapPin, Eye, Edit3,
  ChevronRight, Check, Copy
} from 'lucide-react';
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { invoke } from "@tauri-apps/api/core";
import { EventBus } from "../core/events";
import Editor from '@monaco-editor/react';
import { renderMarkdown } from '../utils/renderMarkdown';
import { ThemeManager } from '../services/ThemeManager';

interface MemoryFile {
  id: string;
  name: string;
  description: string;
  content: string;
  lastSaved: string;
  dirty: boolean;
}

const INITIAL_FILES: MemoryFile[] = [
  {
    id: 'f1', name: 'architecture.md', description: 'System topology & stack',
    lastSaved: '2h ago', dirty: false,
    content: `# Project Architecture\n\n## Components Overview\nWelcome to your project's architectural map. Define system components and structures here.\n\n## Technology Stack\n- Frontend: React + TypeScript\n- Backend: Rust + Tauri\n- Database: Client-side JSON cache\n\n## System Context\n\`\`\`mermaid\ngraph TD\n  Agent[Agent CLI] --> PTY[PTY Process]\n  PTY --> Dashboard[Orchestrator UI]\n\`\`\`\n\n## Module Boundaries\nEach module communicates via typed message passing. No shared mutable state across boundaries.\n\n## Deployment\nSingle binary via Tauri bundler. Auto-update via GitHub releases.\n`,
  },
  {
    id: 'f2', name: 'decisions.md', description: 'Architecture decisions log',
    lastSaved: '1d ago', dirty: false,
    content: `# Architecture Decision Records\n\n## ADR-001: Use Tauri over Electron\n**Date:** 2026-01-12\n**Status:** Accepted\n\n### Context\nWe needed a lightweight desktop shell for the CLI orchestrator UI.\n\n### Decision\nUse Tauri (Rust backend) instead of Electron (Node.js backend).\n\n### Consequences\n- **Positive:** 10x smaller bundle, lower memory usage, better security model\n- **Negative:** Rust knowledge required for native features\n\n---\n\n## ADR-002: JSON Cache over SQLite\n**Date:** 2026-01-15\n**Status:** Accepted\n\n### Context\nPersistent local state for session snapshots and project memory.\n\n### Decision\nUse flat JSON files with file-system watch instead of SQLite.\n\n### Consequences\n- **Positive:** Zero-dependency, human-readable, easily diffable\n- **Negative:** No transactions, must reload on external changes\n`,
  },
  {
    id: 'f3', name: 'findings.md', description: 'Investigations & workarounds',
    lastSaved: '3d ago', dirty: false,
    content: `# Findings & Workarounds\n\n## PTY Resize Race Condition\n**Found:** 2026-02-01\n**Severity:** Medium\n\n### Symptom\nTerminal output garbled when window resized rapidly during active process output.\n\n### Root Cause\nPTY resize signal sent before kernel finishes flushing the previous read buffer.\n\n### Workaround\n\`\`\`rust\n// Debounce resize events by 50ms\npty.debounce_resize(Duration::from_millis(50));\n\`\`\`\n\n---\n\n## Agent Token Counting Off-by-One\n**Found:** 2026-02-08\n**Severity:** Low\n\n### Symptom\nToken counter shows N+1 tokens for certain multi-byte UTF-8 sequences.\n\n### Workaround\nUse \`tiktoken\` crate directly instead of the model-reported count.\n`,
  },
  {
    id: 'f4', name: 'tasks.md', description: 'Checklist of project task items',
    lastSaved: '5h ago', dirty: false,
    content: `# Project Task Checklist\n\n## Sprint 1 - Foundation\n- [x] Set up Tauri project scaffold\n- [x] Implement PTY session manager\n- [x] Create agent profile system\n- [ ] Add session snapshot/restore\n- [ ] Write integration tests for PTY\n\n## Sprint 2 - UI\n- [x] Kanban task board\n- [x] Terminal multiplexer grid\n- [x] Agent swarm panel\n- [ ] Project memory editor\n- [ ] Keyboard shortcut system\n\n## Sprint 3 - Distribution\n- [ ] Code signing for macOS\n- [ ] Windows installer via NSIS\n- [ ] Linux AppImage bundling\n- [ ] Auto-update infrastructure\n- [ ] Public beta release\n\n## Backlog\n- Add mermaid diagram rendering in preview\n- Import/export project memory as zip\n- Agent collaboration mode (shared context)\n`,
  },
];

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div
      className="markdown-preview h-full overflow-y-auto px-8 py-6 text-[var(--text-secondary)] text-sm leading-7 font-sans"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}

interface ProjectMemoryProps {
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  isMemorySaving: boolean;
  setIsMemorySaving: (saving: boolean) => void;
  memorySaveStatus: "idle" | "success" | "error";
  setMemorySaveStatus: (status: "idle" | "success" | "error") => void;
  setMemorySaveError: (error: string) => void;
}

export const ProjectMemory: React.FC<ProjectMemoryProps> = ({
  selectedProjectId,
  setSelectedProjectId,
  isMemorySaving,
  setIsMemorySaving,
  memorySaveStatus,
  setMemorySaveStatus,
  setMemorySaveError
}) => {
  const { projects, activeWorkspaceId, initializeProjectMemory, settings } = useOrchestratorStore();
  const activeProjects = projects.filter(p => p.workspaceId === activeWorkspaceId);
  const project = activeProjects.find(p => p.id === selectedProjectId);

  const [files, setFiles] = useState<MemoryFile[]>(INITIAL_FILES);
  const [activeId, setActiveId] = useState(INITIAL_FILES[0].id);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [saved, setSaved] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [addError, setAddError] = useState('');
  const [addingFile, setAddingFile] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load actual files on mount
  useEffect(() => {
    if (!project) return;
    const loadAll = async () => {
      const loadedFiles = await Promise.all(INITIAL_FILES.map(async f => {
        try {
           const path = `${project.path.replace(/\\/g, "/")}/${f.name}`;
           const content = await invoke<string>("read_project_file", { path });
           return { ...f, content, dirty: false };
        } catch {
           return f; 
        }
      }));
      setFiles(loadedFiles);
    };
    loadAll();
  }, [project?.path]);

  const activeFile = files.find(f => f.id === activeId) || files[0];
  const lineCount = (activeFile.content.match(/\n/g)?.length ?? 0) + 1;

  const updateContent = useCallback((val: string) => {
    setFiles(fs => fs.map(f => f.id === activeId ? { ...f, content: val, dirty: true } : f));
  }, [activeId]);

  const handleSaveFile = async () => {
    if (!project) return;
    setIsMemorySaving(true);
    setMemorySaveStatus("idle");
    const file = files.find(f => f.id === activeId);
    if (!file) return;
    try {
      const path = `${project.path.replace(/\\/g, "/")}/${file.name}`;
      await invoke("write_project_file", { path, content: file.content });
      setMemorySaveStatus("success");
      setFiles(fs => fs.map(f => f.id === activeId ? { ...f, dirty: false, lastSaved: 'just now' } : f));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (file.name === "tasks.md") {
        await initializeProjectMemory(project.id);
      }
    } catch (err: any) {
      console.error(err);
      setMemorySaveStatus("error");
      setMemorySaveError(err.toString());
    } finally {
      setIsMemorySaving(false);
      setTimeout(() => {
        setMemorySaveStatus("idle");
      }, 3000);
    }
  };

  function deleteFile(id: string) {
    if (files.length === 1) return;
    const remaining = files.filter(f => f.id !== id);
    setFiles(remaining);
    if (activeId === id) setActiveId(remaining[0].id);
  }

  function addFile() {
    const name = newFileName.trim() || `note-${Date.now()}.md`;
    const finalName = name.endsWith('.md') ? name : `${name}.md`;
    
    if (files.some(f => f.name.toLowerCase() === finalName.toLowerCase())) {
      setAddError(`File "${finalName}" already exists`);
      return;
    }

    const f: MemoryFile = {
      id: `f${Date.now()}`, name: finalName,
      description: 'New document', content: `# ${finalName.replace('.md', '')}\n\n`,
      lastSaved: 'just now', dirty: false,
    };
    setFiles(prev => [...prev, f]);
    setActiveId(f.id);
    setNewFileName('');
    setAddError('');
    setAddingFile(false);
  }

  function copyContent() {
    navigator.clipboard.writeText(activeFile.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  useEffect(() => {
    const unsub = EventBus.subscribe("project-memory:save", handleSaveFile);
    return unsub;
  }, [project, activeId, files]);

  if (!activeWorkspaceId) return null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* File List Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-[var(--border-glass)] bg-[var(--bg-secondary)] overflow-hidden">
        <div className="flex items-center justify-between px-3 h-11 shrink-0 border-b border-[var(--border-glass)]">
          <span className="text-[10px] font-bold tracking-wider text-[var(--text-muted)]">FILES</span>
          <button
            onClick={() => setAddingFile(true)}
            title="New file"
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--border-glass)] transition-colors cursor-pointer"
          >
            <FilePlus size={12} />
          </button>
        </div>

        {/* New File Input */}
        {addingFile && (
          <div className="px-2.5 py-2.5 border-b border-[var(--border-glass)] bg-[var(--bg-secondary)]/60 fade-in">
            <input
              autoFocus
              value={newFileName}
              onChange={e => { setNewFileName(e.target.value); setAddError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') addFile(); if (e.key === 'Escape') { setAddingFile(false); setAddError(''); } }}
              placeholder="filename.md"
              className={`w-full bg-[var(--bg-tertiary)] border border-[var(--border-glass)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none font-mono ${addError ? 'border-[var(--accent-error)]/50' : 'border-[var(--border-glass-hover)] focus:border-[var(--accent-primary)]/45'}`}
            />
            <div className="flex gap-1.5 mt-2">
              <button onClick={addFile} className="flex-1 py-1 rounded bg-[rgba(var(--accent-primary-rgb),0.15)] text-[var(--accent-primary)] font-bold hover:bg-[rgba(var(--accent-primary-rgb),0.25)] transition-colors cursor-pointer">Create</button>
              <button onClick={() => { setAddingFile(false); setAddError(''); }} className="flex-1 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">Cancel</button>
            </div>
            {addError && (
              <div className="mt-1.5 px-2 py-1 rounded bg-[rgba(var(--accent-error-rgb),0.1)] border border-[rgba(var(--accent-error-rgb),0.2)] text-[var(--accent-error)] text-[10px] font-medium truncate text-center fade-in">
                {addError}
              </div>
            )}
          </div>
        )}

        {/* File Entries */}
        <div className="flex-1 overflow-y-auto py-1">
          {files.map(file => (
            <button
              key={file.id}
              onClick={() => setActiveId(file.id)}
              className={`group w-full text-left px-3 py-2.5 transition-all outline-none border-l-2 ${
                activeId === file.id
                  ? 'border-[var(--accent-primary)] bg-[rgba(var(--accent-primary-rgb),0.1)]'
                  : 'border-transparent hover:bg-[var(--border-glass)] hover:border-[var(--border-glass-hover)]'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={13} className={activeId === file.id ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'} />
                <span className={`text-[13px] font-mono font-bold truncate ${activeId === file.id ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]'}`}>
                  {file.name}
                </span>
                {file.dirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shrink-0 ml-auto" title="Unsaved changes" />
                )}
              </div>
              <p className={`text-[11px] leading-relaxed truncate ${activeId === file.id ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>
                {file.description}
              </p>
              {activeId === file.id && (
                <p className="text-[10px] text-[var(--text-muted)] mt-1">{file.lastSaved}</p>
              )}
            </button>
          ))}
        </div>

        {/* Location */}
        <div className="px-3 py-2.5 border-t border-[var(--border-glass)] bg-[var(--bg-tertiary)]">
          <p className="text-[9px] font-bold tracking-widest text-[var(--text-muted)] mb-1">LOCATION</p>
          <p className="text-[10px] font-mono text-[var(--text-muted)] leading-relaxed break-all">
            {project ? `${project.path}\\${activeFile.name}` : activeFile.name}
          </p>
        </div>
      </aside>

      {/* Editor Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-[var(--bg-tertiary)]">
        {/* Editor Toolbar */}
        <div className="flex items-center gap-1 px-3 h-11 border-b border-[var(--border-glass)] bg-[var(--bg-secondary)]/60 shrink-0">
          {/* Tabs */}
          <div className="flex bg-[var(--bg-tertiary)] border border-[var(--border-glass)] rounded p-0.5 h-7 items-center">
            <button
              onClick={() => setMode('write')}
              className={`text-[10px] px-2.5 h-full rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 font-medium ${
                mode === 'write'
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.15)] text-[var(--accent-primary)] font-bold border border-[rgba(var(--accent-primary-rgb),0.3)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
            >
              <Edit3 size={11} />
              Write Markdown
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`text-[10px] px-2.5 h-full rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 font-medium ${
                mode === 'preview'
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.15)] text-[var(--accent-primary)] font-bold border border-[rgba(var(--accent-primary-rgb),0.3)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
            >
              <Eye size={11} />
              Preview Mode
            </button>
          </div>

          <div className="flex-1" />

          {/* File info */}
          <span className="text-[10px] font-mono text-[var(--text-muted)] hidden sm:block">
            {lineCount} lines · {activeFile.content.length} chars
          </span>

          <div className="w-px h-4 bg-[var(--border-glass)] mx-1" />

          {/* Actions */}
          <button
            onClick={copyContent}
            title="Copy content"
            className="flex items-center justify-center w-7 h-7 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass)] transition-colors cursor-pointer"
          >
            {copied ? <Check size={11} className="text-[var(--agent-status-success)]" /> : <Copy size={11} />}
          </button>

          <button
            onClick={() => deleteFile(activeFile.id)}
            title="Delete file"
            className="flex items-center justify-center w-7 h-7 rounded text-[var(--text-secondary)] hover:text-[var(--accent-error)] hover:bg-[var(--border-glass)] transition-colors cursor-pointer disabled:opacity-30"
            disabled={files.length <= 1}
          >
            <Trash2 size={11} />
          </button>

          <div className="w-px h-4 bg-[var(--border-glass)] mx-1" />

          <button
            onClick={handleSaveFile}
            className={`flex items-center gap-1.5 px-3 h-7 flex items-center justify-center rounded text-[11px] font-bold transition-all cursor-pointer ${
              saved
                ? 'bg-[rgba(34,197,94,0.15)] text-[var(--agent-status-success)] border border-[var(--agent-status-success)]/30'
                : activeFile.dirty
                ? 'bg-[var(--accent-primary)] text-[var(--bg-primary)] hover:bg-[var(--accent-secondary)]'
                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-glass)] hover:text-[var(--text-primary)] hover:border-[var(--border-glass-hover)]'
            }`}
          >
            {saved ? <Check size={11} /> : <Save size={11} />}
            {saved ? 'Saved!' : 'Save Memory'}
          </button>
        </div>

        {/* Content Area */}
        {mode === 'write' ? (
          <div className="flex-grow flex flex-1 min-h-0 overflow-hidden bg-[var(--bg-tertiary)]">
            <Editor
              height="100%"
              language="markdown"
              value={activeFile.content}
              onChange={(val) => updateContent(val || '')}
              theme="vscode-dark"
              beforeMount={(monaco) => {
                const activePresetTheme = ThemeManager.getTheme(settings?.appearance?.theme?.theme || 'Midnight');
                const bg = activePresetTheme.tokens.colors.background || '#060609';
                const cardBg = activePresetTheme.tokens.colors.cardBackground || '#141416';
                const fg = activePresetTheme.tokens.colors.foreground || '#D4D4D4';
                const border = activePresetTheme.tokens.colors.border || '#2c2c2e';

                monaco.editor.defineTheme('vscode-dark', {
                  base: 'vs-dark',
                  inherit: true,
                  rules: [
                    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
                    { token: 'keyword', foreground: 'C586C0' },
                    { token: 'string', foreground: 'CE9178' },
                    { token: 'number', foreground: 'B5CEA8' },
                    { token: 'regexp', foreground: 'D16969' },
                    { token: 'type', foreground: '4EC9B0' },
                    { token: 'class', foreground: '4EC9B0' },
                    { token: 'function', foreground: 'DCDCAA' },
                    { token: 'variable', foreground: '9CDCFE' },
                    { token: 'tag', foreground: '569CD6' },
                    { token: 'tag.id', foreground: '9CDCFE' },
                    { token: 'tag.class', foreground: '9CDCFE' },
                    { token: 'attribute.name', foreground: '9CDCFE' },
                    { token: 'attribute.value', foreground: 'CE9178' }
                  ],
                  colors: {
                    'editor.background': bg,
                    'editor.foreground': fg,
                    'editorCursor.foreground': fg,
                    'editor.lineHighlightBackground': cardBg,
                    'editorLineNumber.foreground': '#858585',
                    'editorLineNumber.activeForeground': fg,
                    'editor.selectionBackground': '#264F78',
                    'minimap.background': bg,
                    'editorIndentGuide.background': border,
                    'editorIndentGuide.background1': border,
                    'editorIndentGuide.activeBackground': '#4e4e50',
                    'editorIndentGuide.activeBackground1': '#4e4e50'
                  }
                });
              }}
              options={{
                readOnly: false,
                minimap: { enabled: settings?.appearance?.workspace?.showMinimap ?? false },
                fontSize: settings?.appearance?.typography?.codeFontSize ?? 12,
                fontFamily: settings?.appearance?.typography?.codeFontFamily ?? "'JetBrains Mono', 'Fira Code', monospace",
                lineNumbers: 'on',
                folding: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                renderIndentGuides: true,
                guides: {
                  indentation: true
                },
                scrollbar: {
                  vertical: 'visible',
                  horizontal: 'visible',
                  useShadows: false,
                  verticalScrollbarSize: 10,
                  horizontalScrollbarSize: 10
                }
              }}
            />
          </div>
        ) : (
          <div className="flex-grow flex-1 min-h-0 overflow-hidden fade-in bg-[var(--bg-tertiary)]">
            <MarkdownPreview content={activeFile.content} />
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-[var(--border-glass)] bg-[var(--bg-tertiary)] shrink-0 h-6">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--accent-primary)]">
              <ChevronRight size={9} />
              {activeFile.name}
            </span>
            {activeFile.dirty && (
              <span className="text-[10px] text-[var(--text-muted)]">● unsaved changes</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-[var(--text-muted)]">Markdown</span>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">UTF-8</span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)]">
              <MapPin size={8} />
              Ln {lineCount}
            </span>
          </div>
        </div>
      </div>

      {/* Markdown styles are now in glassmorphism.css — no inline injection needed */}
    </div>
  );
};
