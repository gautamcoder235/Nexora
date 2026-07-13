import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useChangesetStore } from '../../stores/changesetStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { X, ChevronRight, ChevronDown, Folder, FolderOpen, File, RefreshCw, Camera, ChevronUp } from 'lucide-react';
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
  .markdown-preview .md-check { display: flex; align-items: center; gap: 0.5rem; padding: 0.2rem 0; }
  .markdown-preview .md-checkbox { font-family: 'JetBrains Mono', monospace; font-size: 0.8em; color: #555568; }
  .markdown-preview .md-check.done { color: #22c55e; }
  .markdown-preview .md-check.done .md-checkbox.checked { color: #22c55e; }
  .markdown-preview .md-check:not(.done) { color: #888899; }

  .git-gutter-added {
    background: #2ea44f !important;
    width: 3px !important;
    margin-left: 4px;
  }
  .git-gutter-modified {
    background: #005cc5 !important;
    width: 3px !important;
    margin-left: 4px;
  }
`;

function renderMarkdown(text: string): string {
  if (!text) return '';
  let html = text.replace(/<!--[\s\S]*?-->/g, '');
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const l = lang ? `<span class="md-lang">${lang}</span>` : '';
    return `<div class="md-codeblock">${l}<pre>${code.trimEnd()}</pre></div>`;
  });
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  html = html.replace(/^---+$/gm, '<hr class="md-hr" />');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="md-em">$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  html = html.replace(/^(\s*)- \[x\] (.+)$/gm, (_m, spaces, text) => `<div class="md-check done" style="margin-left: ${spaces.length * 8}px"><span class="md-checkbox checked">✓</span> ${text}</div>`);
  html = html.replace(/^(\s*)- \[\/\] (.+)$/gm, (_m, spaces, text) => `<div class="md-check in-progress" style="margin-left: ${spaces.length * 8}px"><span class="md-checkbox half-checked text-[#f59e0b]">◐</span> <span class="text-[#f59e0b]">${text}</span></div>`);
  html = html.replace(/^(\s*)- \[ \] (.+)$/gm, (_m, spaces, text) => `<div class="md-check" style="margin-left: ${spaces.length * 8}px"><span class="md-checkbox">○</span> ${text}</div>`);
  html = html.replace(/^(\s*)- (.+)$/gm, (_m, spaces, text) => `<div class="md-li" style="margin-left: ${spaces.length * 8}px"><span class="md-bullet">•</span> ${text}</div>`);
  html = html.replace(/^&gt; (.+)$/gm, '<div class="md-blockquote">$1</div>');
  html = html.replace(/\n{2,}/g, '\n\n');
  return html;
}

export function AgentReviewCenter({ repoPath, onClose }: Props) {
  const activeTab = useChangesetStore(s => s.activeReviewTab);
  const setActiveTab = useChangesetStore(s => s.setActiveReviewTab);

  // File Changes state
  const ucteChanges = useChangesetStore(s => s.ucteChanges);
  const isScanningUcte = useChangesetStore(s => s.isScanningUcte);
  const scanFileChanges = useChangesetStore(s => s.scanFileChanges);
  const takeBaseline = useChangesetStore(s => s.takeBaseline);
  const hasBaseline = useChangesetStore(s => s.hasBaseline);
  const baselineFileCount = useChangesetStore(s => s.baselineFileCount);
  const isTakingBaseline = useChangesetStore(s => s.isTakingBaseline);
  const checkBaselineExists = useChangesetStore(s => s.checkBaselineExists);

  // File explorer state
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileAbsolutePath, setSelectedFileAbsolutePath] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, FileNode[]>>({});
  const [workspaceFileContent, setWorkspaceFileContent] = useState<string>('');
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);

  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const projects = useOrchestratorStore(s => s.projects);
  const settings = useOrchestratorStore(s => s.settings);

  const activeProjects = useMemo(() => {
    return projects.filter(p => p.workspaceId === activeWorkspaceId);
  }, [projects, activeWorkspaceId]);

  // Editor state
  const [editedFileContent, setEditedFileContent] = useState<string>('');
  const [debouncedEditedContent, setDebouncedEditedContent] = useState<string>('');
  const [editorTab, setEditorTab] = useState<'preview' | 'edit'>('preview');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasAutoExpanded, setHasAutoExpanded] = useState<boolean>(false);
  const [editorRef, setEditorRef] = useState<any>(null);
  const [monacoRef, setMonacoRef] = useState<any>(null);

  // Diff states
  const [originalContent, setOriginalContent] = useState<string>('');
  const [modifiedContent, setModifiedContent] = useState<string>('');
  const [isDiffLoading, setIsDiffLoading] = useState<boolean>(false);

  // Scan scope: which project to scan, or 'all'
  const [scanScope, setScanScope] = useState<string>('all');

  const loadedPaths = useRef<Set<string>>(new Set());

  // Check baseline on mount
  useEffect(() => {
    checkBaselineExists(repoPath);
  }, [repoPath]);

  // Reset auto-expand tracking and loaded paths when workspace changes
  useEffect(() => {
    setHasAutoExpanded(false);
    loadedPaths.current.clear();
  }, [activeWorkspaceId]);

  // Debounce file edits
  useEffect(() => {
    if (editedFileContent === workspaceFileContent) {
      setDebouncedEditedContent(editedFileContent);
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedEditedContent(editedFileContent);
    }, 400);
    return () => clearTimeout(timer);
  }, [editedFileContent, workspaceFileContent]);

  // Auto-switch to preview for markdown
  useEffect(() => {
    if (selectedFilePath?.toLowerCase().endsWith('.md')) {
      setEditorTab('preview');
    } else {
      setEditorTab('edit');
    }
  }, [selectedFilePath]);

  // Load file content when selection changes
  useEffect(() => {
    if (!selectedFilePath || !selectedFileAbsolutePath) return;

    // Strip [deleted] prefix for path matching
    const cleanPath = selectedFilePath.replace(/^\[deleted\] /, '');
    const isChanged = activeTab === 'changeset' && ucteChanges.includes(selectedFilePath);
    const isDeleted = selectedFilePath.startsWith('[deleted] ');

    if (isChanged && !isDeleted) {
      // Load diff: baseline (original) vs current (modified)
      setIsDiffLoading(true);
      const scanRoot = scanScope !== 'all' ? scanScope : repoPath;
      Promise.all([
        invoke<string>('read_baseline_file', { repoPath: scanRoot, filePath: cleanPath }).catch(() => ''),
        invoke<string>('read_project_file', { path: selectedFileAbsolutePath })
      ])
        .then(([orig, mod]) => {
          setOriginalContent(orig);
          setModifiedContent(mod);
          setWorkspaceFileContent(mod);
          setEditedFileContent(mod);
          setIsDiffLoading(false);
        })
        .catch((err) => {
          console.error("Failed to read files for diff:", err);
          setIsDiffLoading(false);
        });
      return;
    }

    if (isDeleted) {
      // For deleted files, show the baseline content
      const scanRoot = scanScope !== 'all' ? scanScope : repoPath;
      setIsDiffLoading(true);
      invoke<string>('read_baseline_file', { repoPath: scanRoot, filePath: cleanPath })
        .then((orig) => {
          setOriginalContent(orig);
          setModifiedContent('');
          setIsDiffLoading(false);
        })
        .catch(() => setIsDiffLoading(false));
      return;
    }

    // Normal file loading
    setIsFileLoading(true);
    invoke<string>('read_project_file', { path: selectedFileAbsolutePath })
      .then((content) => {
        setWorkspaceFileContent(content);
        setEditedFileContent(content);
        setIsFileLoading(false);
      })
      .catch((err) => {
        console.error("Failed to read file:", err);
        const errMsg = `// Error loading file: ${err}`;
        setWorkspaceFileContent(errMsg);
        setEditedFileContent(errMsg);
        setIsFileLoading(false);
      });
  }, [selectedFilePath, selectedFileAbsolutePath, activeTab, ucteChanges, scanScope]);

  // Clear decorations when selected file changes
  useEffect(() => {
    if (editorRef) {
      editorRef.gitDecorations = editorRef.deltaDecorations(editorRef.gitDecorations || [], []);
    }
  }, [selectedFilePath, editorRef]);

  // Git gutter decorations
  useEffect(() => {
    if (!editorRef || !monacoRef) return;
    const originalLines = workspaceFileContent.split('\n');
    const editedLines = debouncedEditedContent.split('\n');
    const newDecorations: any[] = [];
    const oldDecorations = editorRef.gitDecorations || [];
    for (let i = 0; i < editedLines.length; i++) {
      if (i >= originalLines.length) {
        newDecorations.push({
          range: new monacoRef.Range(i + 1, 1, i + 1, 1),
          options: { isWholeLine: false, linesDecorationsClassName: 'git-gutter-added', overviewRuler: { color: '#2ea44f', position: monacoRef.editor.OverviewRulerLane.Left } }
        });
      } else if (editedLines[i] !== originalLines[i]) {
        newDecorations.push({
          range: new monacoRef.Range(i + 1, 1, i + 1, 1),
          options: { isWholeLine: false, linesDecorationsClassName: 'git-gutter-modified', overviewRuler: { color: '#005cc5', position: monacoRef.editor.OverviewRulerLane.Left } }
        });
      }
    }
    editorRef.gitDecorations = editorRef.deltaDecorations(oldDecorations, newDecorations);
  }, [debouncedEditedContent, workspaceFileContent, editorRef, monacoRef]);

  // Load root directories for active projects
  useEffect(() => {
    if (activeTab === 'workspace' && activeProjects.length > 0) {
      activeProjects.forEach(async (project) => {
        if (!loadedPaths.current.has(project.path)) {
          loadedPaths.current.add(project.path);
          try {
            const nodes = await invoke<FileNode[]>('list_directory', { dirPath: project.path });
            setDirContents(prev => ({ ...prev, [project.path]: nodes }));
          } catch (err) {
            loadedPaths.current.delete(project.path);
          }
        }
      });
    }
  }, [activeTab, activeProjects]);

  // Auto-expand single project
  useEffect(() => {
    if (activeTab === 'workspace' && activeProjects.length === 1 && !hasAutoExpanded) {
      setExpandedDirs(prev => { const next = new Set(prev); next.add(activeProjects[0].path); return next; });
      setHasAutoExpanded(true);
    }
  }, [activeTab, activeProjects, hasAutoExpanded]);

  const handleSave = async () => {
    if (!selectedFileAbsolutePath) return;
    setSaveStatus('saving');
    try {
      await invoke('write_project_file', { path: selectedFileAbsolutePath, content: editedFileContent });
      setWorkspaceFileContent(editedFileContent);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error("Failed to save:", err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const toggleDir = async (dirPath: string) => {
    const next = new Set(expandedDirs);
    if (next.has(dirPath)) {
      next.delete(dirPath);
      setExpandedDirs(next);
    } else {
      next.add(dirPath);
      setExpandedDirs(next);
      if (!dirContents[dirPath]) {
        try {
          const nodes = await invoke<FileNode[]>('list_directory', { dirPath });
          setDirContents(prev => ({ ...prev, [dirPath]: nodes }));
        } catch (err) {
          console.error("Failed to list directory:", err);
        }
      }
    }
  };

  const handleTakeBaseline = () => {
    const target = scanScope !== 'all' ? scanScope : repoPath;
    takeBaseline(target);
  };

  const handleScanChanges = () => {
    const target = scanScope !== 'all' ? scanScope : repoPath;
    scanFileChanges(target);
  };

  // ─── File Changes sidebar ───
  const renderFileChangesSidebar = () => (
    <div className="flex flex-col h-full">
      {/* Scope selector */}
      <div className="p-2 border-b border-[#1B1B22] bg-[#09090b]/60">
        <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Scan Scope</label>
        <select
          value={scanScope}
          onChange={(e) => setScanScope(e.target.value)}
          className="w-full bg-[#121215] border border-[#1B1B22] rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/50"
        >
          <option value="all">All Projects (Root)</option>
          {activeProjects.map(p => (
            <option key={p.id} value={p.path}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Baseline Controls */}
      <div className="p-2 border-b border-[#1B1B22] space-y-1.5 bg-[#09090b]/40">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-500 font-mono">
            {hasBaseline
              ? `Baseline: ${baselineFileCount > 0 ? `${baselineFileCount} files` : 'Ready'}`
              : 'No baseline yet'}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleTakeBaseline}
            disabled={isTakingBaseline}
            className="flex-1 flex items-center justify-center gap-1 bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-50 text-white text-[9px] font-bold py-1.5 rounded transition-all cursor-pointer select-none"
          >
            <Camera size={10} className={isTakingBaseline ? 'animate-pulse' : ''} />
            <span>{isTakingBaseline ? 'Saving...' : 'Take Baseline'}</span>
          </button>
          <button
            onClick={handleScanChanges}
            disabled={isScanningUcte || !hasBaseline}
            className="flex-1 flex items-center justify-center gap-1 bg-[#7C5CFF] hover:bg-[#7C5CFF]/90 disabled:opacity-50 text-white text-[9px] font-bold py-1.5 rounded transition-all cursor-pointer select-none"
          >
            <RefreshCw size={10} className={isScanningUcte ? 'animate-spin' : ''} />
            <span>{isScanningUcte ? 'Scanning...' : 'Scan Changes'}</span>
          </button>
        </div>
        {!hasBaseline && (
          <p className="text-[8px] text-amber-400/80 italic leading-tight">
            Take a baseline first, then edit your files. Scan to see what changed.
          </p>
        )}
      </div>

      {/* Changes List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {ucteChanges.length > 0 && (
          <div className="text-[9px] text-zinc-500 font-mono pb-1 border-b border-[#1B1B22] mb-1">
            {ucteChanges.length} file{ucteChanges.length !== 1 ? 's' : ''} changed
          </div>
        )}
        {ucteChanges.map((file) => {
          const isSelected = selectedFilePath === file;
          const isDeleted = file.startsWith('[deleted] ');
          const displayName = isDeleted ? file.replace('[deleted] ', '') : file;
          return (
            <div
              key={file}
              onClick={() => {
                setSelectedFilePath(file);
                const cleanPath = file.replace(/^\[deleted\] /, '');
                const scanRoot = scanScope !== 'all' ? scanScope : repoPath;
                setSelectedFileAbsolutePath(`${scanRoot}/${cleanPath}`);
              }}
              className={`w-full text-left text-[11px] font-mono py-1.5 px-2 rounded-sm flex items-center gap-2 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#7C5CFF]/10 text-[#7C5CFF] font-semibold border-l-2 border-[#7C5CFF]'
                  : 'text-zinc-400 hover:bg-zinc-900/60'
              }`}
            >
              {isDeleted && (
                <span className="text-[8px] bg-rose-500/15 text-rose-400 px-1 rounded font-bold shrink-0">DEL</span>
              )}
              {!isDeleted && (
                <span className="text-[8px] bg-amber-500/15 text-amber-400 px-1 rounded font-bold shrink-0">MOD</span>
              )}
              <span className="truncate">{displayName}</span>
            </div>
          );
        })}
        {ucteChanges.length === 0 && hasBaseline && (
          <div className="text-center text-zinc-600 italic text-[10px] py-8">
            No changes detected since baseline.
          </div>
        )}
        {ucteChanges.length === 0 && !hasBaseline && (
          <div className="text-center text-zinc-600 italic text-[10px] py-8">
            Take a baseline to start tracking changes.
          </div>
        )}
      </div>
    </div>
  );

  // ─── Project Files sidebar ───
  const renderProjectFilesSidebar = () => (
    <div className="flex-grow overflow-y-auto p-3 space-y-1">
      {activeProjects.length > 0 ? (
        activeProjects.map((project) => {
          const isExpanded = expandedDirs.has(project.path);
          return (
            <div key={project.id} className="flex flex-col">
              <button
                onClick={() => toggleDir(project.path)}
                className="w-full text-left text-xs font-mono py-1.5 px-2 hover:bg-zinc-900/40 flex items-center transition-colors text-zinc-300 hover:text-zinc-100 cursor-pointer rounded-sm outline-none font-bold"
              >
                <span className="flex items-center gap-1.5">
                  <ChevronDown size={14} className={`text-zinc-500 shrink-0 transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`} />
                  {isExpanded
                    ? <FolderOpen size={14} className="text-blue-500/80 fill-blue-500/10 shrink-0" />
                    : <Folder size={14} className="text-blue-500/80 fill-blue-500/10 shrink-0" />
                  }
                  <span className="truncate">{project.name}</span>
                </span>
              </button>
              {isExpanded && (
                <DirectoryTree
                  dirPath={project.path}
                  depth={1}
                  repoPath={project.path}
                  selectedFilePath={selectedFilePath}
                  onFileSelect={(path, absolutePath) => { setSelectedFilePath(path); setSelectedFileAbsolutePath(absolutePath); }}
                  expandedDirs={expandedDirs}
                  toggleDir={toggleDir}
                  dirContents={dirContents}
                />
              )}
            </div>
          );
        })
      ) : repoPath ? (
        <DirectoryTree
          dirPath={repoPath} depth={0} repoPath={repoPath}
          selectedFilePath={selectedFilePath}
          onFileSelect={(path, absolutePath) => { setSelectedFilePath(path); setSelectedFileAbsolutePath(absolutePath); }}
          expandedDirs={expandedDirs} toggleDir={toggleDir} dirContents={dirContents}
        />
      ) : (
        <div className="flex items-center justify-center p-4 text-center text-zinc-500 text-xs font-mono">
          No project directory available.
        </div>
      )}
    </div>
  );

  // ─── Viewport ───
  const renderViewport = () => {
    if (!selectedFilePath) {
      return (
        <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs">
          {activeTab === 'workspace'
            ? 'Select a file from the explorer sidebar to view.'
            : hasBaseline
              ? 'Click "Scan Changes" then select a changed file.'
              : 'Take a baseline first to start tracking file changes.'
          }
        </div>
      );
    }

    const cleanPath = selectedFilePath.replace(/^\[deleted\] /, '');
    const isChanged = activeTab === 'changeset' && ucteChanges.includes(selectedFilePath);
    const isDeleted = selectedFilePath.startsWith('[deleted] ');
    const isMarkdown = cleanPath?.toLowerCase().endsWith('.md');

    return (
      <div className="flex-grow flex flex-col h-full overflow-hidden">
        <style dangerouslySetInnerHTML={{ __html: MARKDOWN_STYLES }} />

        {/* Viewport Header */}
        <div className="bg-[#0c0c0e]/80 border-b border-[#1B1B22] px-4 flex justify-between items-center select-none h-11 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-xs text-zinc-300 truncate" title={cleanPath}>{cleanPath}</span>
            {isDeleted ? (
              <span className="text-[8px] tracking-wide uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold font-mono">
                Deleted
              </span>
            ) : isChanged ? (
              <span className="text-[8px] tracking-wide uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold font-mono">
                Modified (Split Diff)
              </span>
            ) : isMarkdown ? (
              <div className="flex bg-[#121215] border border-[#1B1B22] rounded p-0.5 h-7 items-center shrink-0">
                <button onClick={() => setEditorTab('preview')}
                  className={`text-[10px] px-2.5 h-full rounded transition-all cursor-pointer flex items-center justify-center ${editorTab === 'preview' ? 'bg-blue-500/15 text-blue-400 font-bold border border-blue-500/30' : 'text-zinc-400 hover:text-zinc-200 border border-transparent'}`}>
                  Preview
                </button>
                <button onClick={() => setEditorTab('edit')}
                  className={`text-[10px] px-2.5 h-full rounded transition-all cursor-pointer flex items-center justify-center ${editorTab === 'edit' ? 'bg-blue-500/15 text-blue-400 font-bold border border-blue-500/30' : 'text-zinc-400 hover:text-zinc-200 border border-transparent'}`}>
                  Edit Source
                </button>
              </div>
            ) : (
              <span className="text-[9px] text-zinc-500 font-mono bg-[#101014] px-1.5 py-0.5 rounded border border-[#1B1B22] uppercase shrink-0">
                {getLanguageFromPath(cleanPath)} (Editable)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {saveStatus === 'saving' && <span className="text-xs text-zinc-500 animate-pulse">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-xs text-emerald-400 font-semibold">Saved!</span>}
            {saveStatus === 'error' && <span className="text-xs text-rose-400 font-semibold">Failed to save!</span>}
            {!isChanged && !isDeleted && editedFileContent !== workspaceFileContent && (
              <button onClick={handleSave} disabled={saveStatus === 'saving'}
                className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-[11px] px-3 h-7 flex items-center justify-center rounded transition-colors cursor-pointer select-none">
                Save Changes
              </button>
            )}
          </div>
        </div>

        {/* Monaco Container */}
        <div className="flex-grow w-full min-h-0 relative">
          {(isChanged || isDeleted) ? (
            isDiffLoading ? (
              <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs bg-[#08080a]">
                <RefreshCw className="animate-spin mr-2" size={14} />
                <span>Loading diff contents...</span>
              </div>
            ) : (
              <DiffEditor
                height="100%"
                original={originalContent}
                modified={modifiedContent}
                language={getLanguageFromPath(cleanPath)}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: true },
                  fontSize: 12,
                  renderSideBySide: true,
                }}
              />
            )
          ) : isFileLoading ? (
            <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs bg-[#08080a]">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500 mr-2"></div>
              Loading file content...
            </div>
          ) : isMarkdown && editorTab === 'preview' ? (
            <div className="markdown-preview h-full overflow-y-auto px-8 py-6 text-[#ccccdd] text-sm leading-7 font-sans"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(editedFileContent) }} />
          ) : (
            <Editor
              height="100%"
              language={getLanguageFromPath(cleanPath)}
              value={editedFileContent}
              onChange={(val) => setEditedFileContent(val || '')}
              theme="vscode-dark"
              onMount={(editor, monaco) => { setEditorRef(editor); setMonacoRef(monaco); }}
              beforeMount={(monaco) => {
                monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true });
                monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true });
                monaco.languages.typescript.typescriptDefaults.setCompilerOptions({ jsx: 1, allowNonTsExtensions: true });
                monaco.editor.defineTheme('vscode-dark', {
                  base: 'vs-dark', inherit: true,
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
                    { token: 'attribute.value', foreground: 'CE9178' }
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
                    'editorIndentGuide.activeBackground1': '#4e4e50'
                  }
                });
              }}
              options={{
                readOnly: false,
                minimap: { enabled: settings?.appearance?.workspace?.showMinimap ?? false },
                fontSize: settings?.appearance?.typography?.codeFontSize ?? 12,
                fontFamily: settings?.appearance?.typography?.codeFontFamily ?? "'JetBrains Mono', 'Fira Code', monospace",
                lineNumbers: 'on', folding: true, scrollBeyondLastLine: false, automaticLayout: true,
                renderIndentGuides: true,
                guides: { indentation: true },
                scrollbar: { vertical: 'visible', horizontal: 'visible', useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
              }}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full flex bg-[#0c0c0e] text-zinc-150 select-none overflow-hidden font-sans border border-[#1b1b22] rounded-xl shadow-2xl">
      {/* Sidebar */}
      <div className="w-80 border-r border-[#1B1B22] flex flex-col bg-[#0D0D10] shrink-0">
        {/* Header */}
        <div className="p-3 border-b border-[#1B1B22] flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Review Center</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-[#1B1B22] transition-colors cursor-pointer">
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 p-1 bg-[#09090b] border-b border-[#1B1B22] shrink-0">
          <button onClick={() => setActiveTab('changeset')}
            className={`flex-1 h-7 flex items-center justify-center rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'changeset' ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF]' : 'text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent'
            }`}>
            File Changes
          </button>
          <button onClick={() => setActiveTab('workspace')}
            className={`flex-1 h-7 flex items-center justify-center rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'workspace' ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF]' : 'text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent'
            }`}>
            Project Files
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'changeset' ? renderFileChangesSidebar() : renderProjectFilesSidebar()}
        </div>
      </div>

      {/* Viewport */}
      <div className="flex-grow flex-1 flex flex-col min-w-0 overflow-hidden bg-[#08080a] relative">
        {renderViewport()}
      </div>
    </div>
  );
}

interface DirectoryTreeProps {
  dirPath: string;
  depth: number;
  repoPath: string;
  selectedFilePath: string | null;
  onFileSelect: (path: string, absolutePath: string) => void;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
  dirContents: Record<string, FileNode[]>;
}

export function DirectoryTree({ dirPath, depth, repoPath, selectedFilePath, onFileSelect, expandedDirs, toggleDir, dirContents }: DirectoryTreeProps) {
  const children = dirContents[dirPath] || [];

  const getRelativePath = (absolutePath: string) => {
    const normPath = absolutePath.replace(/\\/g, '/');
    const normRepo = repoPath.replace(/\\/g, '/');
    const prefix = normRepo.endsWith('/') ? normRepo : `${normRepo}/`;
    return normPath.startsWith(prefix) ? normPath.substring(prefix.length) : normPath;
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
                className="w-full text-left text-xs font-mono py-1.5 px-2 hover:bg-zinc-900/40 flex items-center transition-colors text-zinc-300 hover:text-zinc-100 cursor-pointer rounded-sm outline-none"
                aria-expanded={isExpanded}>
                <span className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 16}px` }}>
                  <ChevronDown size={14} className={`text-zinc-500 shrink-0 transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`} />
                  {isExpanded
                    ? <FolderOpen size={14} className="text-blue-500/80 fill-blue-500/10 shrink-0" />
                    : <Folder size={14} className="text-blue-500/80 fill-blue-500/10 shrink-0" />
                  }
                  <span className="truncate">{node.name}</span>
                </span>
              </button>
              {isExpanded && (
                <DirectoryTree dirPath={node.path} depth={depth + 1} repoPath={repoPath}
                  selectedFilePath={selectedFilePath} onFileSelect={onFileSelect}
                  expandedDirs={expandedDirs} toggleDir={toggleDir} dirContents={dirContents} />
              )}
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
