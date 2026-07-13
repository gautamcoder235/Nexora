import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useChangesetStore, HistoryEntry } from '../../stores/changesetStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { X, ChevronDown, Folder, FolderOpen, File, RefreshCw, Undo2, Columns2, AlignJustify, Check, XCircle, Clock, Bookmark, History, FilePlus2, FileEdit, FileX2, ArrowRightLeft } from 'lucide-react';
import { getLanguageFromPath } from '../../utils/language';
import { invoke } from '@tauri-apps/api/core';
import Editor, { DiffEditor } from '@monaco-editor/react';

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}

interface Props {
  repoPath: string;
  onClose: () => void;
}

// ── Shared Monaco Theme ──
const NEXORA_THEME = {
  base: 'vs-dark' as const,
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
    { token: 'attribute.name', foreground: '9CDCFE' },
    { token: 'attribute.value', foreground: 'CE9178' },
  ],
  colors: {
    'editor.background': '#08080a',
    'editor.foreground': '#D4D4D4',
    'editorCursor.foreground': '#AEAFAD',
    'editor.lineHighlightBackground': '#141416',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#C6C6C6',
    'editor.selectionBackground': '#264F78',
    'minimap.background': '#08080a',
    'editorIndentGuide.background': '#2c2c2e',
    'editorIndentGuide.background1': '#2c2c2e',
    'editorIndentGuide.activeBackground': '#4e4e50',
    'editorIndentGuide.activeBackground1': '#4e4e50',
    'diffEditor.insertedTextBackground': '#2ea44f18',
    'diffEditor.removedTextBackground': '#f8514918',
    'diffEditor.insertedLineBackground': '#2ea44f12',
    'diffEditor.removedLineBackground': '#f8514912',
  },
};

function defineTheme(monaco: any) {
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true });
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true });
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({ jsx: 1, allowNonTsExtensions: true });
  monaco.editor.defineTheme('nexora-dark', NEXORA_THEME);
}

const MARKDOWN_STYLES = `
  .markdown-preview h1.md-h1 { font-size: 1.5rem; font-weight: 700; color: #e2e2ea; margin: 1.5rem 0 0.75rem; border-bottom: 1px solid #1e1e28; padding-bottom: 0.5rem; }
  .markdown-preview h2.md-h2 { font-size: 1.1rem; font-weight: 600; color: #ccccdd; margin: 1.25rem 0 0.5rem; }
  .markdown-preview h3.md-h3 { font-size: 0.95rem; font-weight: 600; color: #aaaacc; margin: 1rem 0 0.4rem; }
  .markdown-preview strong.md-bold { color: #f59e0b; font-weight: 600; }
  .markdown-preview em.md-em { color: #888899; font-style: italic; }
  .markdown-preview code.md-code { background: #1a1a22; border: 1px solid #2a2a38; color: #22c55e; font-family: 'JetBrains Mono', monospace; font-size: 0.8em; padding: 0.1em 0.4em; border-radius: 3px; }
  .markdown-preview .md-codeblock { background: #080809; border: 1px solid #1e1e28; border-radius: 6px; margin: 0.75rem 0; overflow: hidden; }
  .markdown-preview .md-codeblock .md-lang { display: block; background: #0d0d10; padding: 0.25rem 0.75rem; font-size: 0.7rem; font-family: 'JetBrains Mono', monospace; color: #f59e0b; border-bottom: 1px solid #1a1a22; }
  .markdown-preview .md-codeblock pre { margin: 0; padding: 0.75rem; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #22c55e; line-height: 1.6; white-space: pre; overflow-x: auto; }
  .markdown-preview .md-li { padding: 0.15rem 0; display: flex; gap: 0.5rem; }
  .markdown-preview .md-bullet { color: #f59e0b; font-size: 0.8em; margin-top: 0.2em; }
  .markdown-preview .md-blockquote { border-left: 2px solid #f59e0b; padding: 0.25rem 0.75rem; color: #888899; background: #0d0d10; margin: 0.5rem 0; }
  .markdown-preview .md-hr { border: none; border-top: 1px solid #1e1e28; margin: 1.25rem 0; }
  .git-gutter-added { background: #2ea44f !important; width: 3px !important; margin-left: 4px; }
  .git-gutter-modified { background: #005cc5 !important; width: 3px !important; margin-left: 4px; }
`;

function renderMarkdown(text: string): string {
  if (!text) return '';
  let html = text.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const l = lang ? `<span class="md-lang">${lang}</span>` : '';
    return `<div class="md-codeblock">${l}<pre>${code.trimEnd()}</pre></div>`;
  });
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  html = html.replace(/^---+$/gm, '<hr class="md-hr" />');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="md-em">$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  html = html.replace(/^(\s*)- (.+)$/gm, (_m, s, t) => `<div class="md-li" style="margin-left: ${s.length * 8}px"><span class="md-bullet">•</span> ${t}</div>`);
  html = html.replace(/^&gt; (.+)$/gm, '<div class="md-blockquote">$1</div>');
  return html;
}

// ── Operation Icons ──
function OpIcon({ op }: { op: string }) {
  switch (op) {
    case 'created': return <FilePlus2 size={12} className="text-emerald-400" />;
    case 'modified': return <FileEdit size={12} className="text-amber-400" />;
    case 'deleted': return <FileX2 size={12} className="text-rose-400" />;
    case 'renamed': return <ArrowRightLeft size={12} className="text-blue-400" />;
    default: return <File size={12} className="text-zinc-400" />;
  }
}

function OpBadge({ op }: { op: string }) {
  const styles: Record<string, string> = {
    created: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20',
    modified: 'bg-amber-500/12 text-amber-400 border-amber-500/20',
    deleted: 'bg-rose-500/12 text-rose-400 border-rose-500/20',
    renamed: 'bg-blue-500/12 text-blue-400 border-blue-500/20',
  };
  const labels: Record<string, string> = { created: 'NEW', modified: 'MOD', deleted: 'DEL', renamed: 'REN' };
  return <span className={`text-[7px] font-bold px-1.5 py-px rounded uppercase tracking-wider border shrink-0 ${styles[op] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>{labels[op] || op}</span>;
}

function formatTime(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts + 'Z');
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

export function AgentReviewCenter({ repoPath, onClose }: Props) {
  const activeTab = useChangesetStore(s => s.activeReviewTab);
  const setActiveTab = useChangesetStore(s => s.setActiveReviewTab);
  const isMemoryInitialized = useChangesetStore(s => s.isMemoryInitialized);
  const isInitializing = useChangesetStore(s => s.isInitializing);
  const pendingChanges = useChangesetStore(s => s.pendingChanges);
  const isCapturing = useChangesetStore(s => s.isCapturing);
  const isLoadingChanges = useChangesetStore(s => s.isLoadingChanges);
  const initMemory = useChangesetStore(s => s.initMemory);
  const captureChanges = useChangesetStore(s => s.captureChanges);
  const loadPendingChanges = useChangesetStore(s => s.loadPendingChanges);
  const approveChange = useChangesetStore(s => s.approveChange);
  const rejectChange = useChangesetStore(s => s.rejectChange);
  const readVersion = useChangesetStore(s => s.readVersion);
  const createCheckpoint = useChangesetStore(s => s.createCheckpoint);

  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileAbsolutePath, setSelectedFileAbsolutePath] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, FileNode[]>>({});
  const [workspaceFileContent, setWorkspaceFileContent] = useState<string>('');
  const [editedFileContent, setEditedFileContent] = useState<string>('');
  const [debouncedEditedContent, setDebouncedEditedContent] = useState<string>('');
  const [editorTab, setEditorTab] = useState<'preview' | 'edit'>('preview');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasAutoExpanded, setHasAutoExpanded] = useState<boolean>(false);
  const [editorRef, setEditorRef] = useState<any>(null);
  const [monacoRef, setMonacoRef] = useState<any>(null);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);

  const [originalContent, setOriginalContent] = useState<string>('');
  const [modifiedContent, setModifiedContent] = useState<string>('');
  const [isDiffLoading, setIsDiffLoading] = useState<boolean>(false);
  const [diffMode, setDiffMode] = useState<'split' | 'inline'>('split');
  const [scanScope, setScanScope] = useState<string>('all');
  const [checkpointName, setCheckpointName] = useState<string>('');
  const [showCheckpointInput, setShowCheckpointInput] = useState(false);

  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const projects = useOrchestratorStore(s => s.projects);
  const settings = useOrchestratorStore(s => s.settings);
  const activeProjects = useMemo(() => projects.filter(p => p.workspaceId === activeWorkspaceId), [projects, activeWorkspaceId]);

  const loadedPaths = useRef<Set<string>>(new Set());
  const initDone = useRef(false);

  // Auto-init Memory Core on mount
  useEffect(() => {
    if (initDone.current || !repoPath) return;
    initDone.current = true;
    const target = scanScope !== 'all' ? scanScope : repoPath;
    initMemory(target).then(() => {
      loadPendingChanges(target);
    });
  }, [repoPath]);

  useEffect(() => { setHasAutoExpanded(false); loadedPaths.current.clear(); }, [activeWorkspaceId]);

  useEffect(() => {
    if (editedFileContent === workspaceFileContent) { setDebouncedEditedContent(editedFileContent); return; }
    const t = setTimeout(() => setDebouncedEditedContent(editedFileContent), 400);
    return () => clearTimeout(t);
  }, [editedFileContent, workspaceFileContent]);

  useEffect(() => {
    setEditorTab(selectedFilePath?.toLowerCase().endsWith('.md') ? 'preview' : 'edit');
  }, [selectedFilePath]);

  // Git-gutter decorations for the regular editor
  useEffect(() => { if (editorRef) editorRef.gitDecorations = editorRef.deltaDecorations(editorRef.gitDecorations || [], []); }, [selectedFilePath, editorRef]);
  useEffect(() => {
    if (!editorRef || !monacoRef) return;
    const origLines = workspaceFileContent.split('\n');
    const editLines = debouncedEditedContent.split('\n');
    const decs: any[] = [];
    for (let i = 0; i < editLines.length; i++) {
      if (i >= origLines.length) decs.push({ range: new monacoRef.Range(i+1,1,i+1,1), options: { isWholeLine: false, linesDecorationsClassName: 'git-gutter-added', overviewRuler: { color: '#2ea44f', position: monacoRef.editor.OverviewRulerLane.Left } } });
      else if (editLines[i] !== origLines[i]) decs.push({ range: new monacoRef.Range(i+1,1,i+1,1), options: { isWholeLine: false, linesDecorationsClassName: 'git-gutter-modified', overviewRuler: { color: '#005cc5', position: monacoRef.editor.OverviewRulerLane.Left } } });
    }
    editorRef.gitDecorations = editorRef.deltaDecorations(editorRef.gitDecorations || [], decs);
  }, [debouncedEditedContent, workspaceFileContent, editorRef, monacoRef]);

  // Load diff content when a pending change is selected
  useEffect(() => {
    if (!selectedEntry) return;
    const target = scanScope !== 'all' ? scanScope : repoPath;
    setIsDiffLoading(true);

    const loadDiff = async () => {
      try {
        let orig = '';
        let mod_content = '';

        if (selectedEntry.old_hash && selectedEntry.operation !== 'created') {
          orig = await readVersion(target, selectedEntry.old_hash);
        }
        if (selectedEntry.operation !== 'deleted') {
          const absPath = `${target}/${selectedEntry.file_path}`;
          try {
            mod_content = await invoke<string>('read_project_file', { path: absPath });
          } catch {
            mod_content = await readVersion(target, selectedEntry.new_hash);
          }
        }
        setOriginalContent(orig);
        setModifiedContent(mod_content);
      } catch (e) {
        console.error('Diff load error:', e);
        setOriginalContent('');
        setModifiedContent('');
      }
      setIsDiffLoading(false);
    };
    loadDiff();
  }, [selectedEntry, scanScope, repoPath]);

  // Load workspace file when selected in Project Files tab
  useEffect(() => {
    if (!selectedFileAbsolutePath || activeTab !== 'workspace') return;
    setIsFileLoading(true);
    invoke<string>('read_project_file', { path: selectedFileAbsolutePath })
      .then(c => { setWorkspaceFileContent(c); setEditedFileContent(c); setIsFileLoading(false); })
      .catch(e => { const m = `// Error: ${e}`; setWorkspaceFileContent(m); setEditedFileContent(m); setIsFileLoading(false); });
  }, [selectedFileAbsolutePath, activeTab]);

  // Directory loading
  useEffect(() => {
    if (activeTab === 'workspace' && activeProjects.length > 0) {
      activeProjects.forEach(async (p) => {
        if (!loadedPaths.current.has(p.path)) {
          loadedPaths.current.add(p.path);
          try { const n = await invoke<FileNode[]>('list_directory', { dirPath: p.path }); setDirContents(prev => ({ ...prev, [p.path]: n })); }
          catch { loadedPaths.current.delete(p.path); }
        }
      });
    }
  }, [activeTab, activeProjects]);

  useEffect(() => {
    if (activeTab === 'workspace' && activeProjects.length === 1 && !hasAutoExpanded) {
      setExpandedDirs(prev => { const n = new Set(prev); n.add(activeProjects[0].path); return n; });
      setHasAutoExpanded(true);
    }
  }, [activeTab, activeProjects, hasAutoExpanded]);

  const handleSave = async () => {
    if (!selectedFileAbsolutePath) return;
    setSaveStatus('saving');
    try {
      await invoke('write_project_file', { path: selectedFileAbsolutePath, content: editedFileContent });
      setWorkspaceFileContent(editedFileContent); setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch { setSaveStatus('error'); setTimeout(() => setSaveStatus('idle'), 3000); }
  };

  const toggleDir = async (dirPath: string) => {
    const next = new Set(expandedDirs);
    if (next.has(dirPath)) { next.delete(dirPath); } else {
      next.add(dirPath);
      if (!dirContents[dirPath]) {
        try { const n = await invoke<FileNode[]>('list_directory', { dirPath }); setDirContents(prev => ({ ...prev, [dirPath]: n })); } catch {}
      }
    }
    setExpandedDirs(next);
  };

  const handleCapture = () => {
    const target = scanScope !== 'all' ? scanScope : repoPath;
    captureChanges(target);
  };

  const handleApprove = async (entry: HistoryEntry) => {
    const target = scanScope !== 'all' ? scanScope : repoPath;
    await approveChange(target, entry.id);
    if (selectedEntry?.id === entry.id) setSelectedEntry(null);
  };

  const handleReject = async (entry: HistoryEntry) => {
    const target = scanScope !== 'all' ? scanScope : repoPath;
    await rejectChange(target, entry.id);
    if (selectedEntry?.id === entry.id) setSelectedEntry(null);
  };

  const handleApproveAll = async () => {
    const target = scanScope !== 'all' ? scanScope : repoPath;
    for (const entry of pendingChanges) {
      await approveChange(target, entry.id);
    }
    setSelectedEntry(null);
  };

  const handleCreateCheckpoint = async () => {
    if (!checkpointName.trim()) return;
    const target = scanScope !== 'all' ? scanScope : repoPath;
    await createCheckpoint(target, checkpointName.trim());
    setCheckpointName('');
    setShowCheckpointInput(false);
  };

  // ─── File Changes Sidebar ───
  const renderChangesSidebar = () => (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-2 py-1.5 border-b border-[#1B1B22] bg-[#09090b]/60 space-y-1.5">
        {/* Scope + Capture Row */}
        <div className="flex items-center gap-1">
          <select
            value={scanScope}
            onChange={(e) => setScanScope(e.target.value)}
            className="flex-1 bg-[#121215] border border-[#252530] rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/40 appearance-none cursor-pointer"
          >
            <option value="all">All Projects</option>
            {activeProjects.map(p => (<option key={p.id} value={p.path}>{p.name}</option>))}
          </select>
          <button
            onClick={handleCapture}
            disabled={isCapturing || isInitializing}
            title="Scan for changes"
            className="h-[24px] px-2 flex items-center gap-1 bg-[#7C5CFF] hover:bg-[#6B4EE6] disabled:opacity-40 text-white text-[9px] font-bold rounded transition-all cursor-pointer select-none shrink-0"
          >
            <RefreshCw size={10} className={isCapturing ? 'animate-spin' : ''} />
            {isCapturing ? '...' : 'Capture'}
          </button>
        </div>
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-500 font-mono">
            {isInitializing ? 'Initializing memory...' : isMemoryInitialized ? `${pendingChanges.length} pending` : 'Not initialized'}
          </span>
          {pendingChanges.length > 0 && (
            <div className="flex items-center gap-1">
              <button onClick={handleApproveAll} title="Approve all" className="text-[8px] text-zinc-500 hover:text-emerald-400 px-1 py-0.5 rounded border border-[#252530] hover:border-emerald-500/30 transition-all cursor-pointer select-none flex items-center gap-0.5">
                <Check size={8} /> All
              </button>
              <button onClick={() => setShowCheckpointInput(!showCheckpointInput)} title="Create checkpoint" className="text-[8px] text-zinc-500 hover:text-blue-400 px-1 py-0.5 rounded border border-[#252530] hover:border-blue-500/30 transition-all cursor-pointer select-none flex items-center gap-0.5">
                <Bookmark size={8} /> Save
              </button>
            </div>
          )}
        </div>
        {/* Checkpoint input */}
        {showCheckpointInput && (
          <div className="flex items-center gap-1">
            <input
              value={checkpointName}
              onChange={e => setCheckpointName(e.target.value)}
              placeholder="Checkpoint name..."
              className="flex-1 bg-[#121215] border border-[#252530] rounded px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-blue-500/40 placeholder:text-zinc-600"
              onKeyDown={e => e.key === 'Enter' && handleCreateCheckpoint()}
              autoFocus
            />
            <button onClick={handleCreateCheckpoint} className="h-[22px] px-2 bg-blue-500/20 text-blue-400 text-[9px] font-bold rounded hover:bg-blue-500/30 border border-blue-500/20 cursor-pointer select-none">
              ✓
            </button>
          </div>
        )}
      </div>

      {/* Pending Changes List */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingChanges ? (
          <div className="flex items-center justify-center py-10 text-zinc-500 text-[10px] font-mono">
            <RefreshCw className="animate-spin mr-2" size={12} /> Loading...
          </div>
        ) : pendingChanges.length > 0 ? (
          <div className="p-1 space-y-px">
            {pendingChanges.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id;
              const shortName = entry.file_path.split('/').pop() || entry.file_path;
              const dirPath = entry.file_path.includes('/') ? entry.file_path.substring(0, entry.file_path.lastIndexOf('/')) : '';
              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`group w-full text-left text-[11px] font-mono py-1.5 px-2 rounded flex items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#7C5CFF]/10 text-zinc-200 border-l-2 border-[#7C5CFF] pl-1.5'
                      : 'text-zinc-400 hover:bg-[#15151a] hover:text-zinc-300 border-l-2 border-transparent'
                  }`}
                >
                  <OpIcon op={entry.operation} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate leading-tight">{shortName}</span>
                      <OpBadge op={entry.operation} />
                    </div>
                    {dirPath && <span className="text-[8px] text-zinc-600 truncate leading-tight">{dirPath}</span>}
                    {entry.old_path && entry.operation === 'renamed' && (
                      <span className="text-[8px] text-blue-500/60 truncate leading-tight">← {entry.old_path}</span>
                    )}
                  </div>
                  {/* Review actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); handleApprove(entry); }} title="Approve"
                      className="p-0.5 rounded hover:bg-emerald-500/15 text-zinc-600 hover:text-emerald-400 transition-all">
                      <Check size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleReject(entry); }} title="Reject & Revert"
                      className="p-0.5 rounded hover:bg-rose-500/15 text-zinc-600 hover:text-rose-400 transition-all">
                      <Undo2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-[#121215] border border-[#252530] flex items-center justify-center mb-3">
              <Check size={18} className="text-emerald-400/50" />
            </div>
            <span className="text-[11px] text-zinc-500 font-mono">No pending changes</span>
            <span className="text-[9px] text-zinc-600 mt-1">Click <strong>Capture</strong> to scan for modifications</span>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Project Files Sidebar ───
  const renderProjectFilesSidebar = () => (
    <div className="flex-grow overflow-y-auto p-3 space-y-1">
      {activeProjects.length > 0 ? (
        activeProjects.map((project) => {
          const isExpanded = expandedDirs.has(project.path);
          return (
            <div key={project.id} className="flex flex-col">
              <button onClick={() => toggleDir(project.path)}
                className="w-full text-left text-xs font-mono py-1.5 px-2 hover:bg-zinc-900/40 flex items-center transition-colors text-zinc-300 hover:text-zinc-100 cursor-pointer rounded-sm outline-none font-bold">
                <span className="flex items-center gap-1.5">
                  <ChevronDown size={14} className={`text-zinc-500 shrink-0 transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`} />
                  {isExpanded ? <FolderOpen size={14} className="text-blue-500/80 fill-blue-500/10 shrink-0" /> : <Folder size={14} className="text-blue-500/80 fill-blue-500/10 shrink-0" />}
                  <span className="truncate">{project.name}</span>
                </span>
              </button>
              {isExpanded && (
                <DirectoryTree dirPath={project.path} depth={1} repoPath={project.path}
                  selectedFilePath={selectedFilePath}
                  onFileSelect={(p, a) => { setSelectedFilePath(p); setSelectedFileAbsolutePath(a); setSelectedEntry(null); }}
                  expandedDirs={expandedDirs} toggleDir={toggleDir} dirContents={dirContents} />
              )}
            </div>
          );
        })
      ) : repoPath ? (
        <DirectoryTree dirPath={repoPath} depth={0} repoPath={repoPath}
          selectedFilePath={selectedFilePath}
          onFileSelect={(p, a) => { setSelectedFilePath(p); setSelectedFileAbsolutePath(a); setSelectedEntry(null); }}
          expandedDirs={expandedDirs} toggleDir={toggleDir} dirContents={dirContents} />
      ) : (
        <div className="flex items-center justify-center p-4 text-center text-zinc-500 text-xs font-mono">No project directory.</div>
      )}
    </div>
  );

  // ─── Viewport ───
  const renderViewport = () => {
    // Diff view for a selected change entry
    if (selectedEntry && activeTab === 'changeset') {
      const cleanPath = selectedEntry.file_path;
      return (
        <div className="flex-grow flex flex-col h-full overflow-hidden">
          <style dangerouslySetInnerHTML={{ __html: MARKDOWN_STYLES }} />
          {/* Header */}
          <div className="bg-[#0c0c0e]/80 border-b border-[#1B1B22] px-4 flex justify-between items-center select-none h-10 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <OpIcon op={selectedEntry.operation} />
              <span className="font-mono text-[11px] text-zinc-300 truncate">{cleanPath}</span>
              <OpBadge op={selectedEntry.operation} />
              {selectedEntry.source && selectedEntry.source !== 'user' && (
                <span className="text-[7px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#7C5CFF]/10 text-[#7C5CFF] border border-[#7C5CFF]/20 font-bold shrink-0">{selectedEntry.source}</span>
              )}
              {selectedEntry.timestamp && (
                <span className="text-[9px] text-zinc-600 font-mono shrink-0"><Clock size={9} className="inline mr-0.5" />{formatTime(selectedEntry.timestamp)}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Split / Inline toggle */}
              <div className="flex bg-[#121215] border border-[#252530] rounded p-0.5 h-6 items-center">
                <button onClick={() => setDiffMode('split')} title="Side by Side"
                  className={`p-0.5 rounded transition-all cursor-pointer ${diffMode === 'split' ? 'bg-[#7C5CFF]/15 text-[#7C5CFF]' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  <Columns2 size={13} />
                </button>
                <button onClick={() => setDiffMode('inline')} title="Inline"
                  className={`p-0.5 rounded transition-all cursor-pointer ${diffMode === 'inline' ? 'bg-[#7C5CFF]/15 text-[#7C5CFF]' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  <AlignJustify size={13} />
                </button>
              </div>
              {/* Approve / Reject */}
              <button onClick={() => handleApprove(selectedEntry)} title="Approve change"
                className="h-6 px-2 flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-[9px] font-bold rounded border border-emerald-500/20 hover:bg-emerald-500/25 cursor-pointer select-none transition-all">
                <Check size={11} /> Approve
              </button>
              <button onClick={() => handleReject(selectedEntry)} title="Reject & Revert"
                className="h-6 px-2 flex items-center gap-1 bg-rose-500/15 text-rose-400 text-[9px] font-bold rounded border border-rose-500/20 hover:bg-rose-500/25 cursor-pointer select-none transition-all">
                <Undo2 size={11} /> Reject
              </button>
            </div>
          </div>
          {/* Diff Editor */}
          <div className="flex-grow w-full min-h-0 relative">
            {isDiffLoading ? (
              <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs bg-[#08080a]">
                <RefreshCw className="animate-spin mr-2" size={14} /><span>Loading diff...</span>
              </div>
            ) : (
              <DiffEditor
                height="100%"
                original={originalContent}
                modified={modifiedContent}
                language={getLanguageFromPath(cleanPath)}
                theme="nexora-dark"
                beforeMount={defineTheme}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: settings?.appearance?.typography?.codeFontSize ?? 12,
                  fontFamily: settings?.appearance?.typography?.codeFontFamily ?? "'JetBrains Mono', 'Fira Code', monospace",
                  renderSideBySide: diffMode === 'split',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  scrollbar: { vertical: 'visible', horizontal: 'visible', useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                }}
              />
            )}
          </div>
        </div>
      );
    }

    // File view for Project Files tab
    if (selectedFilePath && activeTab === 'workspace') {
      const isMarkdown = selectedFilePath?.toLowerCase().endsWith('.md');
      return (
        <div className="flex-grow flex flex-col h-full overflow-hidden">
          <style dangerouslySetInnerHTML={{ __html: MARKDOWN_STYLES }} />
          {/* Header */}
          <div className="bg-[#0c0c0e]/80 border-b border-[#1B1B22] px-4 flex justify-between items-center select-none h-10 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-mono text-[11px] text-zinc-300 truncate">{selectedFilePath}</span>
              {isMarkdown ? (
                <div className="flex bg-[#121215] border border-[#1B1B22] rounded p-0.5 h-6 items-center shrink-0">
                  <button onClick={() => setEditorTab('preview')} className={`text-[9px] px-2 h-full rounded transition-all cursor-pointer ${editorTab === 'preview' ? 'bg-blue-500/15 text-blue-400 font-bold border border-blue-500/30' : 'text-zinc-400 hover:text-zinc-200 border border-transparent'}`}>Preview</button>
                  <button onClick={() => setEditorTab('edit')} className={`text-[9px] px-2 h-full rounded transition-all cursor-pointer ${editorTab === 'edit' ? 'bg-blue-500/15 text-blue-400 font-bold border border-blue-500/30' : 'text-zinc-400 hover:text-zinc-200 border border-transparent'}`}>Edit</button>
                </div>
              ) : (
                <span className="text-[8px] text-zinc-500 font-mono bg-[#101014] px-1.5 py-0.5 rounded border border-[#1B1B22] uppercase shrink-0">{getLanguageFromPath(selectedFilePath)}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {saveStatus === 'saving' && <span className="text-[10px] text-zinc-500 animate-pulse">Saving...</span>}
              {saveStatus === 'saved' && <span className="text-[10px] text-emerald-400 font-semibold">Saved!</span>}
              {saveStatus === 'error' && <span className="text-[10px] text-rose-400 font-semibold">Failed!</span>}
              {editedFileContent !== workspaceFileContent && (
                <button onClick={handleSave} disabled={saveStatus === 'saving'}
                  className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-[10px] px-2.5 h-6 rounded transition-colors cursor-pointer select-none">Save</button>
              )}
            </div>
          </div>
          {/* Editor */}
          <div className="flex-grow w-full min-h-0 relative">
            {isFileLoading ? (
              <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs bg-[#08080a]">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500 mr-2" /> Loading...
              </div>
            ) : isMarkdown && editorTab === 'preview' ? (
              <div className="markdown-preview h-full overflow-y-auto px-8 py-6 text-[#ccccdd] text-sm leading-7 font-sans"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(editedFileContent) }} />
            ) : (
              <Editor
                height="100%"
                language={getLanguageFromPath(selectedFilePath)}
                value={editedFileContent}
                onChange={(val) => setEditedFileContent(val || '')}
                theme="nexora-dark"
                onMount={(editor, monaco) => { setEditorRef(editor); setMonacoRef(monaco); }}
                beforeMount={defineTheme}
                options={{
                  readOnly: false,
                  minimap: { enabled: settings?.appearance?.workspace?.showMinimap ?? false },
                  fontSize: settings?.appearance?.typography?.codeFontSize ?? 12,
                  fontFamily: settings?.appearance?.typography?.codeFontFamily ?? "'JetBrains Mono', 'Fira Code', monospace",
                  lineNumbers: 'on', folding: true, scrollBeyondLastLine: false, automaticLayout: true,
                  renderIndentGuides: true, guides: { indentation: true },
                  scrollbar: { vertical: 'visible', horizontal: 'visible', useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                }}
              />
            )}
          </div>
        </div>
      );
    }

    // Empty state
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#121215] border border-[#252530] flex items-center justify-center">
            <History size={24} className="text-[#7C5CFF]/40" />
          </div>
          <span className="text-[12px] text-zinc-400 font-mono">
            {activeTab === 'workspace' ? 'Select a file to view' : 'Select a change to review'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full flex bg-[#0c0c0e] text-zinc-150 select-none overflow-hidden font-sans border border-[#1b1b22] rounded-xl shadow-2xl">
      {/* Sidebar */}
      <div className="w-72 border-r border-[#1B1B22] flex flex-col bg-[#0D0D10] shrink-0">
        {/* Header */}
        <div className="h-10 px-3 border-b border-[#1B1B22] flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold text-zinc-200 uppercase tracking-wider">Memory Core</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-[#1B1B22] transition-colors cursor-pointer">
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-px p-1 bg-[#09090b] border-b border-[#1B1B22] shrink-0">
          <button onClick={() => setActiveTab('changeset')}
            className={`flex-1 h-7 flex items-center justify-center gap-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'changeset' ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF]' : 'text-zinc-500 hover:text-zinc-300 bg-transparent border border-transparent'
            }`}>
            <History size={11} /> Changes
          </button>
          <button onClick={() => setActiveTab('workspace')}
            className={`flex-1 h-7 flex items-center justify-center gap-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'workspace' ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF]' : 'text-zinc-500 hover:text-zinc-300 bg-transparent border border-transparent'
            }`}>
            <Folder size={11} /> Files
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'changeset' ? renderChangesSidebar() : renderProjectFilesSidebar()}
        </div>
      </div>

      {/* Viewport */}
      <div className="flex-grow flex-1 flex flex-col min-w-0 overflow-hidden bg-[#08080a] relative">
        {renderViewport()}
      </div>
    </div>
  );
}

// ─── DirectoryTree (unchanged) ───
interface DirectoryTreeProps {
  dirPath: string; depth: number; repoPath: string;
  selectedFilePath: string | null;
  onFileSelect: (path: string, absolutePath: string) => void;
  expandedDirs: Set<string>; toggleDir: (path: string) => void;
  dirContents: Record<string, FileNode[]>;
}

export function DirectoryTree({ dirPath, depth, repoPath, selectedFilePath, onFileSelect, expandedDirs, toggleDir, dirContents }: DirectoryTreeProps) {
  const children = dirContents[dirPath] || [];
  const getRelativePath = (abs: string) => {
    const n = abs.replace(/\\/g, '/'); const r = repoPath.replace(/\\/g, '/');
    const p = r.endsWith('/') ? r : `${r}/`;
    return n.startsWith(p) ? n.substring(p.length) : n;
  };

  return (
    <div className="flex flex-col select-none space-y-0.5">
      {children.map((node) => {
        const isExpanded = expandedDirs.has(node.path);
        const relPath = getRelativePath(node.path);
        const isSelected = selectedFilePath === relPath;
        if (node.is_dir) {
          return (
            <div key={node.path} className="flex flex-col">
              <button onClick={() => toggleDir(node.path)}
                className="w-full text-left text-xs font-mono py-1.5 px-2 hover:bg-zinc-900/40 flex items-center transition-colors text-zinc-300 hover:text-zinc-100 cursor-pointer rounded-sm outline-none">
                <span className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 16}px` }}>
                  <ChevronDown size={14} className={`text-zinc-500 shrink-0 transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`} />
                  {isExpanded ? <FolderOpen size={14} className="text-blue-500/80 fill-blue-500/10 shrink-0" /> : <Folder size={14} className="text-blue-500/80 fill-blue-500/10 shrink-0" />}
                  <span className="truncate">{node.name}</span>
                </span>
              </button>
              {isExpanded && <DirectoryTree dirPath={node.path} depth={depth + 1} repoPath={repoPath} selectedFilePath={selectedFilePath} onFileSelect={onFileSelect} expandedDirs={expandedDirs} toggleDir={toggleDir} dirContents={dirContents} />}
            </div>
          );
        } else {
          return (
            <button key={node.path} onClick={() => onFileSelect(relPath, node.path)}
              className={`w-full text-left text-xs font-mono py-1.5 px-2 flex items-center transition-colors cursor-pointer rounded-sm outline-none ${
                isSelected ? 'bg-blue-500/10 text-blue-400 font-semibold border-l-2 border-blue-500' : 'text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
              }`}>
              <span className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 16 + 20}px` }}>
                <File size={14} className="text-zinc-500 shrink-0" />
                <span className="truncate">{node.name}</span>
              </span>
            </button>
          );
        }
      })}
    </div>
  );
}
