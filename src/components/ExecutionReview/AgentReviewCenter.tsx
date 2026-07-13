import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useChangesetStore, TimelineEntry, FileOperation, HunkSelection } from '../../stores/changesetStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { X, ChevronDown, Folder, FolderOpen, File, RefreshCw, Undo2, Columns2, AlignJustify, Check, Bookmark, History, FilePlus2, FileEdit, FileX2, ArrowRightLeft, User, Cpu, Terminal, AppWindow, Play, Info } from 'lucide-react';
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

// ── Icons for sources ──
function SourceIcon({ src }: { src: string }) {
  switch (src?.toLowerCase()) {
    case 'agent': return <Cpu size={12} className="text-purple-400" />;
    case 'terminal': return <Terminal size={12} className="text-amber-400" />;
    case 'external': return <AppWindow size={12} className="text-blue-400" />;
    default: return <User size={12} className="text-zinc-400" />;
  }
}

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
    created: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    modified: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    deleted: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    renamed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };
  const labels: Record<string, string> = { created: 'NEW', modified: 'MOD', deleted: 'DEL', renamed: 'REN' };
  return <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${styles[op] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>{labels[op] || op}</span>;
}

export function AgentReviewCenter({ repoPath, onClose }: Props) {
  const activeTab = useChangesetStore(s => s.activeReviewTab);
  const setActiveTab = useChangesetStore(s => s.setActiveReviewTab);
  const isMemoryInitialized = useChangesetStore(s => s.isMemoryInitialized);
  const isInitializing = useChangesetStore(s => s.isInitializing);
  const timeline = useChangesetStore(s => s.timeline);
  const isCapturing = useChangesetStore(s => s.isCapturing);
  const isLoadingChanges = useChangesetStore(s => s.isLoadingChanges);
  const initMemory = useChangesetStore(s => s.initMemory);
  const captureSnapshot = useChangesetStore(s => s.captureSnapshot);
  const loadHistory = useChangesetStore(s => s.loadHistory);
  const createCheckpoint = useChangesetStore(s => s.createCheckpoint);
  const restoreCommit = useChangesetStore(s => s.restoreCommit);
  const reviewCommit = useChangesetStore(s => s.reviewCommit);
  const applyHunks = useChangesetStore(s => s.applyHunks);
  const readCommitVersion = useChangesetStore(s => s.readCommitVersion);

  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set());
  const [selectedCommit, setSelectedCommit] = useState<TimelineEntry | null>(null);
  const [selectedFileOp, setSelectedFileOp] = useState<FileOperation | null>(null);

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
  const [isScopeDropdownOpen, setIsScopeDropdownOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [checkpointName, setCheckpointName] = useState<string>('');
  const [showCheckpointInput, setShowCheckpointInput] = useState(false);

  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const projects = useOrchestratorStore(s => s.projects);
  const settings = useOrchestratorStore(s => s.settings);
  const activeProjects = useMemo(() => projects.filter(p => p.workspaceId === activeWorkspaceId), [projects, activeWorkspaceId]);

  const loadedPaths = useRef<Set<string>>(new Set());
  const initDone = useRef(false);

  // Initialize all projects in the workspace on mount
  useEffect(() => {
    if (initDone.current || activeProjects.length === 0) return;
    initDone.current = true;
    const paths = activeProjects.map(p => p.path);
    initMemory(paths).then(() => {
      const activePath = scanScope !== 'all' ? [scanScope] : paths;
      loadHistory(activePath);
    });
  }, [activeProjects]);

  // Reload history when scanScope changes or memory is initialized
  useEffect(() => {
    if (!isMemoryInitialized || activeProjects.length === 0) return;
    const activePath = scanScope !== 'all' ? [scanScope] : activeProjects.map(p => p.path);
    loadHistory(activePath);
  }, [scanScope, isMemoryInitialized, activeProjects]);

  // Load first commit expand automatically
  useEffect(() => {
    if (timeline.length > 0 && expandedCommits.size === 0) {
      setExpandedCommits(new Set([timeline[0].git_commit_hash]));
    }
  }, [timeline]);

  useEffect(() => { setHasAutoExpanded(false); loadedPaths.current.clear(); }, [activeWorkspaceId]);

  useEffect(() => {
    if (editedFileContent === workspaceFileContent) { setDebouncedEditedContent(editedFileContent); return; }
    const t = setTimeout(() => setDebouncedEditedContent(editedFileContent), 400);
    return () => clearTimeout(t);
  }, [editedFileContent, workspaceFileContent]);

  useEffect(() => {
    setEditorTab(selectedFilePath?.toLowerCase().endsWith('.md') ? 'preview' : 'edit');
  }, [selectedFilePath]);

  // Monaco decorations for tracking edits in project files edit mode
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

  // Load diff content when a commit file is selected
  useEffect(() => {
    if (!selectedCommit || !selectedFileOp) return;
    const target = selectedCommit.project_path;
    setIsDiffLoading(true);

    const loadDiff = async () => {
      try {
        let orig = '';
        let mod = '';

        // Original content (previous version from parent commit: hash~1)
        if (selectedFileOp.operation_type !== 'created') {
          orig = await readCommitVersion(target, `${selectedCommit.git_commit_hash}~1`, selectedFileOp.file_path);
        }
        // Modified content (version from the commit itself)
        if (selectedFileOp.operation_type !== 'deleted') {
          mod = await readCommitVersion(target, selectedCommit.git_commit_hash, selectedFileOp.file_path);
        }

        setOriginalContent(orig);
        setModifiedContent(mod);
      } catch (e) {
        console.error('Failed to load version diff:', e);
        setOriginalContent('');
        setModifiedContent('');
      }
      setIsDiffLoading(false);
    };

    loadDiff();
  }, [selectedCommit, selectedFileOp]);

  // Load workspace file content
  useEffect(() => {
    if (!selectedFileAbsolutePath || activeTab !== 'workspace') return;
    setIsFileLoading(true);
    invoke<string>('read_project_file', { path: selectedFileAbsolutePath })
      .then(c => { setWorkspaceFileContent(c); setEditedFileContent(c); setIsFileLoading(false); })
      .catch(e => { const m = `// Error: ${e}`; setWorkspaceFileContent(m); setEditedFileContent(m); setIsFileLoading(false); });
  }, [selectedFileAbsolutePath, activeTab]);

  // Directory lists
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
    const target = scanScope !== 'all' ? [scanScope] : activeProjects.map(p => p.path);
    captureSnapshot(target, 'user', 'Manual snapshot');
  };

  const handleAccept = async (commitHash: string) => {
    if (!selectedCommit) return;
    const target = selectedCommit.project_path;
    await reviewCommit(target, commitHash, 'approved');
    if (selectedCommit.git_commit_hash === commitHash) {
      setSelectedCommit(prev => prev ? { ...prev, status: 'approved' } : null);
    }
  };

  const handleRevert = async (commitHash: string) => {
    if (!selectedCommit) return;
    const target = selectedCommit.project_path;
    await reviewCommit(target, commitHash, 'rejected');
    if (selectedCommit.git_commit_hash === commitHash) {
      setSelectedCommit(prev => prev ? { ...prev, status: 'rejected' } : null);
    }
  };

  const handleRevertFile = async (commitHash: string, filePath: string) => {
    const target = selectedCommit?.project_path || (scanScope !== 'all' ? scanScope : activeProjects[0]?.path);
    if (!target) return;
    await restoreCommit(target, `${commitHash}~1`, [filePath]);
    await captureSnapshot(target, 'system', `Reverted ${filePath} to before ${commitHash.substring(0,7)}`);
  };

  const handleRestoreProject = (commit: TimelineEntry) => {
    setConfirmModal({
      isOpen: true,
      message: `Are you sure you want to restore the entire project state to ${commit.git_commit_hash.substring(0,7)}?`,
      onConfirm: async () => {
        await restoreCommit(commit.project_path, commit.git_commit_hash);
        setConfirmModal(null);
      }
    });
  };

  const handleCreateCheckpoint = async () => {
    if (!checkpointName.trim()) return;
    const target = scanScope !== 'all' ? [scanScope] : activeProjects.map(p => p.path);
    for (const path of target) {
      await createCheckpoint(path, checkpointName.trim());
    }
    setCheckpointName('');
    setShowCheckpointInput(false);
  };

  const toggleCommitExpand = (hash: string) => {
    setExpandedCommits(prev => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  // ─── File Changes Sidebar ───
  const renderChangesSidebar = () => (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-2.5 py-2 border-b border-[#1B1B22] bg-[#09090b]/60 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] text-zinc-500 font-mono">Operations</span>
          <button
            onClick={handleCapture}
            disabled={isCapturing || isInitializing}
            title="Stage and capture automatic snapshot"
            className="h-[24px] px-2.5 flex items-center gap-1 bg-[#7C5CFF] hover:bg-[#6B4EE6] disabled:opacity-40 text-white text-[9px] font-bold rounded transition-all cursor-pointer select-none shrink-0"
          >
            <RefreshCw size={10} className={isCapturing ? 'animate-spin' : ''} />
            {isCapturing ? 'Scanning...' : 'Snapshot'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-500 font-mono">
            {isInitializing ? 'Booting Git Engine...' : isMemoryInitialized ? `${timeline.length} history states` : 'Not initialized'}
          </span>
          {isMemoryInitialized && (
            <button onClick={() => setShowCheckpointInput(!showCheckpointInput)}
              className="text-[8px] text-zinc-500 hover:text-blue-400 px-1.5 py-0.5 rounded border border-[#252530] hover:border-blue-500/30 transition-all cursor-pointer select-none flex items-center gap-0.5">
              <Bookmark size={8} /> Checkpoint
            </button>
          )}
        </div>

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

      {/* History Timeline List */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingChanges ? (
          <div className="flex items-center justify-center py-10 text-zinc-500 text-[10px] font-mono">
            <RefreshCw className="animate-spin mr-2" size={12} /> Reading timeline...
          </div>
        ) : timeline.length > 0 ? (
          <div className="p-1.5 space-y-1.5">
            {timeline.map((commit) => {
              const isExpanded = expandedCommits.has(commit.git_commit_hash);
              const displayDesc = commit.description || `Commit ${commit.git_commit_hash.substring(0, 7)}`;
              
              // Status color helper
              const statusDot = commit.status === 'approved' 
                ? 'bg-emerald-500' 
                : commit.status === 'rejected' 
                ? 'bg-rose-500' 
                : 'bg-amber-500 animate-pulse';

              return (
                <div key={commit.git_commit_hash} className="bg-[#121215]/50 border border-[#1b1b22] rounded overflow-hidden">
                  {/* Header Row */}
                  <div
                    onClick={() => toggleCommitExpand(commit.git_commit_hash)}
                    className="p-2 flex items-center justify-between hover:bg-[#15151a] cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} title={`Review state: ${commit.status}`} />
                      <SourceIcon src={commit.source} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0 w-full justify-between">
                          <span className="text-[10px] font-medium text-zinc-200 truncate leading-tight flex-1" title={displayDesc}>{displayDesc}</span>
                          <span className={`text-[8px] px-1 py-px rounded font-mono shrink-0 font-bold ${
                            commit.files.length === 0 
                              ? 'bg-[#16161a] text-zinc-500 border border-[#252530]'
                              : 'bg-[#1a1a22] text-[#22c55e] border border-[#22c55e]/20'
                          }`} title={`${commit.files.length} files changed`}>
                            {commit.files.length}
                          </span>
                        </div>
                        <span className="text-[8px] text-zinc-500 font-mono mt-0.5">{commit.git_commit_hash.substring(0, 7)} · {commit.source}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isExpanded && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRestoreProject(commit); }}
                          title="Restore entire project to this state"
                          className="text-[8px] text-[#7C5CFF] hover:text-white bg-[#7C5CFF]/10 hover:bg-[#7C5CFF] border border-[#7C5CFF]/20 px-1.5 py-0.5 rounded transition-all cursor-pointer font-bold select-none"
                        >
                          Restore
                        </button>
                      )}
                      <ChevronDown size={12} className={`text-zinc-500 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                    </div>
                  </div>

                  {/* Expanded Files */}
                  {isExpanded && (
                    <div className="border-t border-[#1b1b22]/80 bg-[#09090b]/40 py-1 px-1.5 space-y-0.5">
                      {commit.files.map((fileOp) => {
                        const isFileSelected = selectedCommit?.git_commit_hash === commit.git_commit_hash && selectedFileOp?.id === fileOp.id;
                        const shortName = fileOp.file_path.split('/').pop() || fileOp.file_path;
                        return (
                          <div
                            key={fileOp.id}
                            onClick={() => {
                              setSelectedCommit(commit);
                              setSelectedFileOp(fileOp);
                            }}
                            className={`group w-full text-left text-[10px] font-mono py-1 px-1.5 rounded flex items-center justify-between transition-all cursor-pointer ${
                              isFileSelected
                                ? 'bg-[#7C5CFF]/10 text-zinc-200 border-l border-[#7C5CFF]'
                                : 'text-zinc-400 hover:bg-[#15151a] hover:text-zinc-300 border-l border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <OpIcon op={fileOp.operation_type} />
                              <span className="truncate">{shortName}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <OpBadge op={fileOp.operation_type} />
                              {commit.status === 'pending' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRevertFile(commit.git_commit_hash, fileOp.file_path); }}
                                  title="Revert just this file"
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-500/15 text-zinc-500 hover:text-rose-400 transition-all"
                                >
                                  <Undo2 size={10} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {commit.files.length === 0 && (
                        <div className="text-center text-zinc-600 italic text-[9px] py-1.5">Empty baseline/snapshot.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-[#121215] border border-[#252530] flex items-center justify-center mb-3">
              <History size={18} className="text-zinc-500" />
            </div>
            <span className="text-[11px] text-zinc-500 font-mono">Empty Repository</span>
            <span className="text-[9px] text-zinc-600 mt-1">Booting database and initializing session baseline...</span>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Project Files Sidebar ───
  const renderProjectFilesSidebar = () => {
    const filteredProjects = activeProjects.filter(p => scanScope === 'all' || p.path === scanScope);
    return (
      <div className="flex-grow overflow-y-auto p-3 space-y-1">
        {filteredProjects.length > 0 ? (
          filteredProjects.map((project) => {
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
                  onFileSelect={(p, a) => { setSelectedFilePath(p); setSelectedFileAbsolutePath(a); setSelectedCommit(null); setSelectedFileOp(null); }}
                  expandedDirs={expandedDirs} toggleDir={toggleDir} dirContents={dirContents} />
              )}
            </div>
          );
        })
      ) : repoPath ? (
        <DirectoryTree dirPath={repoPath} depth={0} repoPath={repoPath}
          selectedFilePath={selectedFilePath}
          onFileSelect={(p, a) => { setSelectedFilePath(p); setSelectedFileAbsolutePath(a); setSelectedCommit(null); setSelectedFileOp(null); }}
          expandedDirs={expandedDirs} toggleDir={toggleDir} dirContents={dirContents} />
      ) : (
        <div className="flex items-center justify-center p-4 text-center text-zinc-500 text-xs font-mono">No project directory.</div>
      )}
      </div>
    );
  };

  // ─── Viewport ───
  const renderViewport = () => {
    // Diff view for timeline file selection
    if (selectedCommit && selectedFileOp && activeTab === 'changeset') {
      const cleanPath = selectedFileOp.file_path;
      return (
        <div className="flex-grow flex flex-col h-full overflow-hidden">
          <style dangerouslySetInnerHTML={{ __html: MARKDOWN_STYLES }} />
          {/* Header */}
          <div className="bg-[#0c0c0e]/80 border-b border-[#1B1B22] px-4 flex justify-between items-center select-none h-10 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <OpIcon op={selectedFileOp.operation_type} />
              <span className="font-mono text-[11px] text-zinc-300 truncate">{cleanPath}</span>
              <OpBadge op={selectedFileOp.operation_type} />
              {selectedCommit.status === 'pending' ? (
                <span className="text-[7px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold shrink-0">Review Pending</span>
              ) : (
                <span className={`text-[7px] tracking-wider uppercase px-1.5 py-0.5 rounded border font-bold shrink-0 ${
                  selectedCommit.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>{selectedCommit.status}</span>
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

              {/* Review Actions */}
              {selectedCommit.status === 'pending' && (
                <>
                  <button onClick={() => handleAccept(selectedCommit.git_commit_hash)} title="Accept changes (Keep)"
                    className="h-6 px-2 flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-[9px] font-bold rounded border border-emerald-500/20 hover:bg-emerald-500/25 cursor-pointer select-none transition-all">
                    <Check size={11} /> Accept
                  </button>
                  <button onClick={() => handleRevert(selectedCommit.git_commit_hash)} title="Revert changes cleanly"
                    className="h-6 px-2 flex items-center gap-1 bg-rose-500/15 text-rose-400 text-[9px] font-bold rounded border border-rose-500/20 hover:bg-rose-500/25 cursor-pointer select-none transition-all">
                    <Undo2 size={11} /> Revert
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Metadata details panel below header */}
          <div className="bg-[#09090b]/80 border-b border-[#1b1b22] px-4 py-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-mono text-zinc-500 shrink-0">
            <span>Commit: <strong className="text-zinc-300">{selectedCommit.git_commit_hash.substring(0, 16)}</strong></span>
            <span>Source: <strong className="text-zinc-300">{selectedCommit.source}</strong></span>
            <span>Time: <strong className="text-zinc-300">{selectedCommit.timestamp}</strong></span>
            {selectedCommit.session_desc && (
              <span className="flex items-center gap-0.5"><Info size={10} /> Session: <strong className="text-zinc-300">{selectedCommit.session_desc}</strong></span>
            )}
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

    // Workspace Project Files tab selection
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

    // Default Empty State
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#121215] border border-[#252530] flex items-center justify-center">
            <History size={24} className="text-[#7C5CFF]/30" />
          </div>
          <span className="text-[12px] text-zinc-400 font-mono">
            {activeTab === 'workspace' ? 'Select a file to edit' : 'Select a file diff under a timeline commit'}
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
            <History size={11} /> Timeline
          </button>
          <button onClick={() => setActiveTab('workspace')}
            className={`flex-1 h-7 flex items-center justify-center gap-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'workspace' ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF]' : 'text-zinc-500 hover:text-zinc-300 bg-transparent border border-transparent'
            }`}>
            <Folder size={11} /> Files
          </button>
        </div>

        {/* Custom Scope Picker Dropdown (visible in both Timeline and Files tabs) */}
        <div className="px-2.5 py-2 bg-[#09090b]/40 border-b border-[#1B1B22] shrink-0 relative">
          <button
            onClick={() => setIsScopeDropdownOpen(!isScopeDropdownOpen)}
            className="w-full flex items-center justify-between bg-[#121215] hover:bg-[#15151b] border border-[#252530] rounded px-2.5 py-1 text-[10px] text-zinc-300 transition-all cursor-pointer select-none text-left font-mono"
          >
            <span>{scanScope === 'all' ? 'All Projects' : activeProjects.find(p => p.path === scanScope)?.name || scanScope}</span>
            <ChevronDown size={12} className={`text-zinc-500 transition-transform duration-200 ${isScopeDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isScopeDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsScopeDropdownOpen(false)} />
              <div className="absolute left-2.5 right-2.5 mt-1 bg-[#0c0c0e]/95 border border-[#252530] rounded shadow-2xl z-50 py-1 overflow-hidden font-mono border-t-0 animate-in fade-in duration-100">
                <button
                  onClick={() => { setScanScope('all'); setIsScopeDropdownOpen(false); }}
                  className={`w-full text-left text-[10px] px-3 py-1.5 transition-all hover:bg-[#7C5CFF]/10 hover:text-white cursor-pointer ${
                    scanScope === 'all' ? 'text-[#7C5CFF] font-bold bg-[#7C5CFF]/5' : 'text-zinc-400'
                  }`}
                >
                  All Projects
                </button>
                {activeProjects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setScanScope(p.path); setIsScopeDropdownOpen(false); }}
                    className={`w-full text-left text-[10px] px-3 py-1.5 transition-all hover:bg-[#7C5CFF]/10 hover:text-white cursor-pointer ${
                      scanScope === p.path ? 'text-[#7C5CFF] font-bold bg-[#7C5CFF]/5' : 'text-zinc-400'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
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

      {/* Custom Confirmation Popup Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-200">
          <div className="bg-[#0c0c0e]/95 border border-[#252530] rounded-xl p-5 w-[380px] max-w-[90vw] shadow-2xl flex flex-col gap-4 font-sans select-none animate-in zoom-in duration-150">
            <h3 className="text-zinc-200 text-xs font-bold uppercase tracking-wider">Confirm Action</h3>
            <p className="text-zinc-400 text-[11px] leading-relaxed font-mono">{confirmModal.message}</p>
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 bg-[#1A1A22] hover:bg-[#252530] border border-[#252530] text-zinc-300 text-[10px] font-bold rounded-lg transition-all cursor-pointer select-none"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-3.5 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer select-none"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
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
