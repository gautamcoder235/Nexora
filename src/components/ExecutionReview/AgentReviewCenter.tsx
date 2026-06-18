import React, { useEffect, useState, useMemo } from 'react';
import { useChangesetStore } from '../../stores/changesetStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { Pin, PinOff, X, ChevronRight, ChevronDown, Folder, FolderOpen, File } from 'lucide-react';
import { PatchDiffViewer } from './PatchDiffViewer';
import { getLanguageFromPath } from '../../utils/language';
import { ChangesetFile, FileChangeStatus, CommentSeverity } from '../../types/changeset';
import { invoke } from '@tauri-apps/api/core';
import Editor from '@monaco-editor/react';
import { WorkspaceExplorer } from './WorkspaceExplorer';

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

  /* Git Gutter decorations for editor */
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

  // Strip HTML comments (like metadata tags) before escaping
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
  const changesets = useChangesetStore(s => s.changesets);
  const activeChangesetId = useChangesetStore(s => s.activeChangesetId);
  const isLoading = useChangesetStore(s => s.isLoading);
  const error = useChangesetStore(s => s.error);
  const loadChangesets = useChangesetStore(s => s.loadChangesets);
  const selectChangeset = useChangesetStore(s => s.selectChangeset);
  const updateFileStatus = useChangesetStore(s => s.updateFileStatus);
  const runValidation = useChangesetStore(s => s.runValidation);
  const applyChangesetTransaction = useChangesetStore(s => s.applyChangesetTransaction);
  const rollbackChangeset = useChangesetStore(s => s.rollbackChangeset);
  const isReviewPanelPinned = useChangesetStore(s => s.isReviewPanelPinned);
  const toggleReviewPanelPinned = useChangesetStore(s => s.toggleReviewPanelPinned);
  const terminals = useOrchestratorStore(s => s.terminals);

  const activeTab = useChangesetStore(s => s.activeReviewTab);
  const setActiveTab = useChangesetStore(s => s.setActiveReviewTab);

  const [selectedFile, setSelectedFile] = useState<ChangesetFile | null>(null);
  const [selectedAgentTab, setSelectedAgentTab] = useState<'files' | 'tester' | 'reviewer' | 'architect'>('files');
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileAbsolutePath, setSelectedFileAbsolutePath] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, FileNode[]>>({});
  const [workspaceFileContent, setWorkspaceFileContent] = useState<string>('');
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);

  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const projects = useOrchestratorStore(s => s.projects);
  const activeProjects = useMemo(() => {
    return projects.filter(p => p.workspaceId === activeWorkspaceId);
  }, [projects, activeWorkspaceId]);

  const [editedFileContent, setEditedFileContent] = useState<string>('');
  const [editorTab, setEditorTab] = useState<'preview' | 'edit'>('preview');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasAutoExpanded, setHasAutoExpanded] = useState<boolean>(false);
  const [editorRef, setEditorRef] = useState<any>(null);
  const [monacoRef, setMonacoRef] = useState<any>(null);

  // Reset auto-expand tracking when workspace changes
  useEffect(() => {
    setHasAutoExpanded(false);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (selectedFilePath?.toLowerCase().endsWith('.md')) {
      setEditorTab('preview');
    } else {
      setEditorTab('edit');
    }
  }, [selectedFilePath]);

  const handleSave = async () => {
    if (!selectedFileAbsolutePath) return;
    setSaveStatus('saving');
    try {
      await invoke('write_project_file', {
        path: selectedFileAbsolutePath,
        content: editedFileContent
      });
      setWorkspaceFileContent(editedFileContent);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error("Failed to save project file:", err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  useEffect(() => {
    console.log('AgentReviewCenter: Mount - Loading changesets');
    loadChangesets();
  }, [loadChangesets]);

  // Reset selected file when the active changeset changes
  useEffect(() => {
    console.log('AgentReviewCenter: Resetting selectedFile because activeChangesetId changed to:', activeChangesetId);
    setSelectedFile(null);
    setSelectedFilePath(null);
    setSelectedFileAbsolutePath(null);
  }, [activeChangesetId]);

  const activeChangeset = activeChangesetId ? changesets[activeChangesetId] : null;

  useEffect(() => {
    if (activeChangeset && activeChangeset.files.length > 0 && !selectedFilePath) {
      console.log('AgentReviewCenter: Setting selectedFile to first file of activeChangeset:', activeChangeset.files[0].path);
      setSelectedFile(activeChangeset.files[0]);
      setSelectedFilePath(activeChangeset.files[0].path);
      setSelectedFileAbsolutePath(`${repoPath}/${activeChangeset.files[0].path}`);
    }
  }, [activeChangeset, selectedFilePath, repoPath]);

  // Load workspace file content when selectedFilePath changes and is not in changeset files
  useEffect(() => {
    if (!selectedFilePath || !selectedFileAbsolutePath) return;
    
    const isModified = activeChangeset?.files.some(f => f.path === selectedFilePath);
    if (isModified) {
      // Content is already in memory via changeset store
      return;
    }
    
    const loadFileContent = async () => {
      setIsFileLoading(true);
      try {
        const content = await invoke<string>('read_project_file', { path: selectedFileAbsolutePath });
        setWorkspaceFileContent(content);
        setEditedFileContent(content);
      } catch (err) {
        console.error("Error reading project file:", err);
        const errMsg = `// Error loading file: ${err}`;
        setWorkspaceFileContent(errMsg);
        setEditedFileContent(errMsg);
      } finally {
        setIsFileLoading(false);
      }
    };
    
    loadFileContent();
  }, [selectedFilePath, selectedFileAbsolutePath, activeChangeset]);

  // Clear decorations when selected file path changes
  useEffect(() => {
    if (editorRef) {
      editorRef.gitDecorations = editorRef.deltaDecorations(editorRef.gitDecorations || [], []);
    }
  }, [selectedFilePath, editorRef]);

  // Apply git decorations dynamically when content changes in the normal editor
  useEffect(() => {
    if (!editorRef || !monacoRef) return;
    
    const originalLines = workspaceFileContent.split('\n');
    const editedLines = editedFileContent.split('\n');
    
    const newDecorations: any[] = [];
    const oldDecorations = editorRef.gitDecorations || [];
    
    for (let i = 0; i < editedLines.length; i++) {
      const editedLine = editedLines[i];
      const originalLine = originalLines[i];
      
      if (i >= originalLines.length) {
        // Added line
        newDecorations.push({
          range: new monacoRef.Range(i + 1, 1, i + 1, 1),
          options: {
            isWholeLine: false,
            linesDecorationsClassName: 'git-gutter-added',
            overviewRuler: {
              color: '#2ea44f',
              position: monacoRef.editor.OverviewRulerLane.Left
            }
          }
        });
      } else if (editedLine !== originalLine) {
        // Modified line
        newDecorations.push({
          range: new monacoRef.Range(i + 1, 1, i + 1, 1),
          options: {
            isWholeLine: false,
            linesDecorationsClassName: 'git-gutter-modified',
            overviewRuler: {
              color: '#005cc5',
              position: monacoRef.editor.OverviewRulerLane.Left
            }
          }
        });
      }
    }
    
    editorRef.gitDecorations = editorRef.deltaDecorations(oldDecorations, newDecorations);
  }, [editedFileContent, workspaceFileContent, editorRef, monacoRef]);

  // Load root directories for active projects when switching to workspace tab
  useEffect(() => {
    if (activeTab === 'workspace' && activeProjects.length > 0) {
      activeProjects.forEach(async (project) => {
        if (!dirContents[project.path]) {
          try {
            const nodes = await invoke<FileNode[]>('list_directory', { dirPath: project.path });
            setDirContents(prev => ({
              ...prev,
              [project.path]: nodes
            }));
          } catch (err) {
            console.error(`Error loading root directory for project ${project.name}:`, err);
          }
        }
      });
    }
  }, [activeTab, activeProjects, dirContents]);

  // Auto-expand single project once when switching to workspace tab
  useEffect(() => {
    if (activeTab === 'workspace' && activeProjects.length === 1 && !hasAutoExpanded) {
      const project = activeProjects[0];
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.add(project.path);
        return next;
      });
      setHasAutoExpanded(true);
    }
  }, [activeTab, activeProjects, hasAutoExpanded]);

  // Toggle directory logic
  const toggleDir = async (dirPath: string) => {
    const nextExpanded = new Set(expandedDirs);
    if (nextExpanded.has(dirPath)) {
      nextExpanded.delete(dirPath);
      setExpandedDirs(nextExpanded);
    } else {
      nextExpanded.add(dirPath);
      setExpandedDirs(nextExpanded);
      
      if (!dirContents[dirPath]) {
        try {
          const nodes = await invoke<FileNode[]>('list_directory', { dirPath });
          setDirContents(prev => ({
            ...prev,
            [dirPath]: nodes
          }));
        } catch (err) {
          console.error("Error listing directory:", err);
        }
      }
    }
  };

  const handleApply = async () => {
    if (!activeChangesetId) return;
    const success = await applyChangesetTransaction(activeChangesetId, repoPath);
    if (success) {
      // Run post-apply validation automatically to verify the applied state
      await runValidation(activeChangesetId, repoPath);
      const cset = useChangesetStore.getState().changesets[activeChangesetId];
      if (cset.validationStatus === 'failed') {
        setShowRecoveryDialog(true);
      } else {
        useOrchestratorStore.getState().showAlertDialog('Changeset Applied', 'Changeset applied successfully!');
      }
    } else {
      useOrchestratorStore.getState().showAlertDialog('Apply Failed', 'Transaction failed. Workspace reverted.');
    }
  };

  const handleRollback = async () => {
    if (!activeChangesetId) return;
    const success = await rollbackChangeset(activeChangesetId, repoPath);
    if (success) {
      setShowRecoveryDialog(false);
      useOrchestratorStore.getState().showAlertDialog('Changeset Rolled Back', 'Changeset rolled back successfully.');
    } else {
      useOrchestratorStore.getState().showAlertDialog('Rollback Failed', 'Failed to rollback changeset.');
    }
  };

  const getSeverityBadgeColor = (severity: CommentSeverity) => {
    switch (severity) {
      case 'BLOCKER':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'ERROR':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'WARNING':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'INFO':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[#08080a] text-zinc-100 p-6 gap-4 relative">
        <div className="absolute top-4 right-4">
          <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer transition-colors text-sm">✕</button>
        </div>
        <span className="text-rose-400 font-bold text-sm">Error Loading Changesets</span>
        <pre className="text-xs text-zinc-450 max-w-md bg-zinc-900 border border-zinc-800 p-4 rounded whitespace-pre-wrap break-all">
          {error}
        </pre>
        <button 
          onClick={() => loadChangesets()}
          className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-xs px-4 py-2 rounded cursor-pointer transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading && Object.keys(changesets).length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#08080a] text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (activeTab === 'worktree_explorer') {
    return (
      <div className="flex h-full w-full bg-[#08080a] text-zinc-100 font-sans overflow-hidden relative flex-col">
        {/* Main Header of Review Center */}
        <div className="px-4 border-b border-zinc-800 flex justify-between items-center bg-[#0c0c0e]/60 shrink-0 h-11">
          <h2 className="text-xs font-semibold tracking-wide uppercase text-zinc-400">Agent Review Center</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (terminals.length <= 8) {
                  toggleReviewPanelPinned();
                  setTimeout(() => {
                    useOrchestratorStore.getState().saveSnapshot();
                  }, 0);
                }
              }}
              title={
                terminals.length > 8
                  ? "Docking disabled (> 8 terminals)"
                  : isReviewPanelPinned
                  ? "Float Panel"
                  : "Dock Panel"
              }
              className={`p-1 rounded transition-all cursor-pointer ${
                terminals.length > 8
                  ? "opacity-35 cursor-not-allowed text-zinc-500"
                  : isReviewPanelPinned
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20"
                  : "text-zinc-500 hover:text-zinc-350 hover:bg-white/5"
              }`}
            >
              {isReviewPanelPinned ? (
                <Pin size={11} className="fill-amber-500" />
              ) : (
                <PinOff size={11} />
              )}
            </button>
            <button 
              onClick={onClose} 
              title="Close Review Center"
              className="p-1 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-3 h-10 border-b border-zinc-800 flex items-center gap-1.5 shrink-0 bg-[#0c0c0e]/45">
          <button
            onClick={() => setActiveTab('changeset')}
            className="flex-1 h-7 flex items-center justify-center rounded text-[11px] font-semibold transition-all cursor-pointer text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent"
          >
            Changeset Diffs
          </button>
          <button
            onClick={() => setActiveTab('workspace')}
            className="flex-1 h-7 flex items-center justify-center rounded text-[11px] font-semibold transition-all cursor-pointer text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent"
          >
            Project Files
          </button>
          <button
            onClick={() => setActiveTab('worktree_explorer')}
            className="flex-1 h-7 flex items-center justify-center rounded text-[11px] font-semibold transition-all cursor-pointer bg-amber-500/15 text-amber-550 border border-amber-500/35 font-bold"
          >
            Worktree Explorer
          </button>
        </div>

        {/* Worktree Explorer Body */}
        <div className="flex-grow min-h-0">
          <WorkspaceExplorer repoPath={repoPath} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-[#08080a] text-zinc-100 font-sans overflow-hidden relative">
      
      {/* Sidebar: Changeset Tree Explorer */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-[#0c0c0e] shrink-0">
        <div className="px-4 border-b border-border-glass flex justify-between items-center bg-[#0c0c0e]/60 shrink-0 h-11">
          <h2 className="text-xs font-semibold tracking-wide uppercase text-zinc-400">Agent Review Center</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (terminals.length <= 8) {
                  toggleReviewPanelPinned();
                  setTimeout(() => {
                    useOrchestratorStore.getState().saveSnapshot();
                  }, 0);
                }
              }}
              title={
                terminals.length > 8
                  ? "Docking disabled (> 8 terminals)"
                  : isReviewPanelPinned
                  ? "Float Panel"
                  : "Dock Panel"
              }
              className={`p-1 rounded transition-all cursor-pointer ${
                terminals.length > 8
                  ? "opacity-35 cursor-not-allowed text-zinc-500"
                  : isReviewPanelPinned
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20"
                  : "text-zinc-500 hover:text-zinc-350 hover:bg-white/5"
              }`}
            >
              {isReviewPanelPinned ? (
                <Pin size={11} className="fill-amber-500" />
              ) : (
                <PinOff size={11} />
              )}
            </button>
            <button 
              onClick={onClose} 
              title="Close Review Center"
              className="p-1 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Changeset Select List */}
        <div className="p-3 border-b border-zinc-800">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">Select Changeset</label>
          <select 
            value={activeChangesetId || ''} 
            onChange={(e) => {
              if (e.target.value) {
                selectChangeset(e.target.value);
              }
            }}
            className="w-full bg-[#121215] border border-zinc-800 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 text-zinc-300"
          >
            <option value="" disabled>-- Choose changeset --</option>
            {Object.values(changesets).map((c) => (
              <option key={c.id} value={c.id}>
                #{c.id.split('-').pop()} — {c.title}
              </option>
            ))}
          </select>
        </div>

        {/* Sidebar Tab Selector */}
        <div className="px-3 h-10 border-b border-zinc-800 flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setActiveTab('changeset')}
            className={`flex-1 h-7 flex items-center justify-center rounded text-[11px] font-semibold transition-all cursor-pointer ${
              activeTab === 'changeset'
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-500 font-bold'
                : 'text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent'
            }`}
          >
            Changeset Diffs
          </button>
          <button
            onClick={() => setActiveTab('workspace')}
            className={`flex-1 h-7 flex items-center justify-center rounded text-[11px] font-semibold transition-all cursor-pointer ${
              activeTab === 'workspace'
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-500 font-bold'
                : 'text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent'
            }`}
          >
            Project Files
          </button>
          <button
            onClick={() => setActiveTab('worktree_explorer')}
            className="flex-1 h-7 flex items-center justify-center rounded text-[11px] font-semibold transition-all cursor-pointer text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent"
          >
            Worktree Explorer
          </button>
        </div>

        {activeTab === 'changeset' ? (
          activeChangeset ? (
            <div className="flex-grow overflow-y-auto p-4 space-y-6">
              
              {/* Proposing Agent: Builder */}
              <div className="space-y-2">
                <div 
                  className={`flex items-center justify-between cursor-pointer p-1.5 rounded transition-colors ${selectedAgentTab === 'files' ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/25'}`}
                  onClick={() => setSelectedAgentTab('files')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">🤖</span>
                    <span className="text-xs font-semibold text-zinc-300">Builder Agent (Proposer)</span>
                  </div>
                  <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-mono">
                    {activeChangeset.files.length} files
                  </span>
                </div>
                {selectedAgentTab === 'files' && (
                  <div className="pl-6 space-y-1">
                    {activeChangeset.files.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => {
                          setSelectedFile(file);
                          setSelectedFilePath(file.path);
                          setSelectedFileAbsolutePath(`${repoPath}/${file.path}`);
                        }}
                        className={`w-full text-left text-xs font-mono py-1.5 px-2.5 rounded flex items-center justify-between transition-colors ${selectedFilePath === file.path ? 'bg-indigo-500/10 text-indigo-400 font-semibold' : 'text-zinc-400 hover:bg-zinc-900'}`}
                      >
                        <span className="truncate">{file.path.split('/').pop()}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-zinc-500 italic shrink-0">{file.change_source}</span>
                          <input
                            type="checkbox"
                            checked={file.status !== 'rejected'}
                            onChange={(e) => {
                              updateFileStatus(
                                activeChangeset.id,
                                file.path,
                                e.target.checked ? 'accepted' : 'rejected'
                              );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer h-3.5 w-3.5"
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Verification Agent: Tester */}
              <div className="space-y-2">
                <div 
                  className={`flex items-center justify-between cursor-pointer p-1.5 rounded transition-colors ${selectedAgentTab === 'tester' ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/25'}`}
                  onClick={() => setSelectedAgentTab('tester')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">🧪</span>
                    <span className="text-xs font-semibold text-zinc-300">Tester Agent (Validation)</span>
                  </div>
                  <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                    activeChangeset.validationStatus === 'passed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    activeChangeset.validationStatus === 'failed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                    activeChangeset.validationStatus === 'running' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' :
                    'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                  }`}>
                    {activeChangeset.validationStatus || 'idle'}
                  </span>
                </div>
                {selectedAgentTab === 'tester' && (
                  <div className="pl-6 text-xs text-zinc-400 space-y-3">
                    <button
                      onClick={() => runValidation(activeChangeset.id, repoPath)}
                      disabled={activeChangeset.validationStatus === 'running'}
                      className="w-full bg-[#121215] hover:bg-[#18181f] disabled:opacity-50 text-zinc-300 font-medium py-1.5 px-3 rounded border border-zinc-800 transition-colors text-center cursor-pointer"
                    >
                      {activeChangeset.validationStatus === 'running' ? 'Running Tests...' : 'Run Shadow Validation'}
                    </button>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      {activeChangeset.comments
                        .filter((c) => c.agent_name === 'Tester Agent')
                        .map((c) => {
                          const lines = c.comment.split('\n');
                          const header = lines[0];
                          const details = lines.slice(1).join('\n');
                          const severityClass = getSeverityBadgeColor(c.severity) || 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                          return (
                            <div key={c.id} className={`p-2 border rounded ${severityClass}`}>
                              <div className="font-semibold">{header}</div>
                              {details.trim() && (
                                <pre className="mt-1.5 p-1.5 bg-[#050507]/60 border border-current/10 rounded overflow-x-auto text-[10px] text-zinc-350 leading-normal max-h-40 whitespace-pre-wrap">
                                  {details.replace(/^```\n?|```$/g, '').trim()}
                                </pre>
                              )}
                            </div>
                          );
                        })}
                      {activeChangeset.comments.filter((c) => c.agent_name === 'Tester Agent').length === 0 && (
                        <p className="text-zinc-500 italic">No failures detected.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Audit Agent: Reviewer */}
              <div className="space-y-2">
                <div 
                  className={`flex items-center justify-between cursor-pointer p-1.5 rounded transition-colors ${selectedAgentTab === 'reviewer' ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/25'}`}
                  onClick={() => setSelectedAgentTab('reviewer')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">🔍</span>
                    <span className="text-xs font-semibold text-zinc-350">Reviewer Agent (Audit)</span>
                  </div>
                  <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono">
                    {activeChangeset.comments.filter(c => c.agent_name !== 'Tester Agent' && c.agent_name !== 'Architect Agent').length} issues
                  </span>
                </div>
                {selectedAgentTab === 'reviewer' && (
                  <div className="pl-6 space-y-2">
                    {activeChangeset.comments
                      .filter((c) => c.agent_name !== 'Tester Agent' && c.agent_name !== 'Architect Agent')
                      .map((c) => (
                        <div key={c.id} className={`p-2 rounded border text-xs ${getSeverityBadgeColor(c.severity)}`}>
                          <div className="flex items-center justify-between font-bold text-[10px] uppercase tracking-wider mb-1">
                            <span>{c.agent_name}</span>
                            <span>{c.severity}</span>
                          </div>
                          <p className="text-zinc-300 font-mono text-[11px] leading-relaxed">{c.comment}</p>
                        </div>
                      ))}
                    {activeChangeset.comments.filter((c) => c.agent_name !== 'Tester Agent' && c.agent_name !== 'Architect Agent').length === 0 && (
                      <p className="text-zinc-500 text-xs italic pl-1">No reviewer issues found.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Governance Agent: Architect */}
              <div className="space-y-2">
                <div 
                  className={`flex items-center justify-between cursor-pointer p-1.5 rounded transition-colors ${selectedAgentTab === 'architect' ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/25'}`}
                  onClick={() => setSelectedAgentTab('architect')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">📐</span>
                    <span className="text-xs font-semibold text-zinc-300">Architect Agent (Specs)</span>
                  </div>
                </div>
                {selectedAgentTab === 'architect' && (
                  <div className="pl-6 space-y-2">
                    {activeChangeset.comments
                      .filter((c) => c.agent_name === 'Architect Agent')
                      .map((c) => (
                        <div key={c.id} className="p-2.5 bg-blue-500/5 border border-blue-500/10 text-blue-400 rounded text-xs">
                          <p className="font-mono text-[11px] leading-relaxed">{c.comment}</p>
                        </div>
                      ))}
                    {activeChangeset.comments.filter((c) => c.agent_name === 'Architect Agent').length === 0 && (
                      <p className="text-zinc-500 text-xs italic pl-1">No architectural recommendations.</p>
                    )}
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="flex-grow flex items-center justify-center p-4 text-center text-zinc-500 text-xs font-mono">
              No active changeset loaded.
            </div>
          )
        ) : (
          <div className="flex-grow overflow-y-auto p-3 space-y-1">
            {activeProjects.length > 0 ? (
              activeProjects.map((project) => {
                const isExpanded = expandedDirs.has(project.path);
                return (
                  <div key={project.id} className="flex flex-col">
                    <button
                      onClick={() => toggleDir(project.path)}
                      className="w-full text-left text-xs font-mono py-1.5 px-2 hover:bg-zinc-900/40 flex items-center transition-colors text-zinc-300 hover:text-zinc-100 cursor-pointer rounded-sm focus-visible:ring-1 focus-visible:ring-amber-500/50 outline-none font-bold"
                    >
                      <span className="flex items-center gap-1.5">
                        <ChevronDown
                          size={14}
                          className={`text-zinc-500 shrink-0 transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`}
                        />
                        {isExpanded ? (
                          <FolderOpen size={14} className="text-amber-500/80 fill-amber-500/10 shrink-0" />
                        ) : (
                          <Folder size={14} className="text-amber-500/80 fill-amber-500/10 shrink-0" />
                        )}
                        <span className="truncate">{project.name}</span>
                      </span>
                    </button>
                    {isExpanded && (
                      <DirectoryTree
                        dirPath={project.path}
                        depth={1}
                        repoPath={project.path}
                        selectedFilePath={selectedFilePath}
                        onFileSelect={(path, absolutePath) => {
                          const matchedFile = activeChangeset?.files.find(f => f.path === path);
                          if (matchedFile) {
                            setSelectedFile(matchedFile);
                          } else {
                            setSelectedFile(null);
                          }
                          setSelectedFilePath(path);
                          setSelectedFileAbsolutePath(absolutePath);
                        }}
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
                dirPath={repoPath}
                depth={0}
                repoPath={repoPath}
                selectedFilePath={selectedFilePath}
                onFileSelect={(path, absolutePath) => {
                  const matchedFile = activeChangeset?.files.find(f => f.path === path);
                  if (matchedFile) {
                    setSelectedFile(matchedFile);
                  } else {
                    setSelectedFile(null);
                  }
                  setSelectedFilePath(path);
                  setSelectedFileAbsolutePath(absolutePath);
                }}
                expandedDirs={expandedDirs}
                toggleDir={toggleDir}
                dirContents={dirContents}
              />
            ) : (
              <div className="flex items-center justify-center p-4 text-center text-zinc-500 text-xs font-mono">
                No project directory available.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Diff Editor Viewport */}
      <div className="flex-grow flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent relative">
        {activeChangeset ? (
          <div className="flex-grow flex flex-col h-full overflow-hidden">
            
            {/* Changeset Title / Meta Bar */}
            <div className="px-4 border-b border-zinc-800 bg-[#0c0c0e]/40 flex justify-between items-center shrink-0 text-zinc-100 h-11">
              <div className="min-w-0 flex-1 mr-4">
                <h3 className="text-sm font-bold text-white truncate leading-none mb-0.5" title={activeChangeset.title}>{activeChangeset.title}</h3>
                <p className="text-[10px] text-zinc-400 max-w-xl truncate leading-normal" title={activeChangeset.explanation}>{activeChangeset.explanation}</p>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                {activeChangeset.status === 'applied' ? (
                  <button
                    onClick={handleRollback}
                    className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 font-medium text-[11px] px-3 h-7 flex items-center justify-center rounded cursor-pointer transition-colors"
                  >
                    Rollback Changeset
                  </button>
                ) : (
                  <button
                    onClick={handleApply}
                    disabled={activeChangeset.files.filter(f => f.status !== 'rejected').length === 0}
                    className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white font-medium text-[11px] px-3 h-7 flex items-center justify-center rounded cursor-pointer transition-colors"
                  >
                    Apply Changeset Transaction
                  </button>
                )}
              </div>
            </div>

            {/* Monaco Viewport */}
            <div className="flex-grow overflow-hidden bg-[#08080a]">
              {selectedFilePath ? (
                (() => {
                  const changesetFile = activeChangeset?.files.find(f => f.path === selectedFilePath);
                  if (changesetFile) {
                    return (
                      <PatchDiffViewer
                        originalContent={changesetFile.old_content}
                        proposedContent={changesetFile.new_content}
                        filePath={changesetFile.path}
                      />
                    );
                  } else if (isFileLoading) {
                    return (
                      <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs bg-[#08080a]">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-amber-500 mr-2"></div>
                        Loading file content...
                      </div>
                    );
                  } else {
                    const isMarkdown = selectedFilePath?.toLowerCase().endsWith('.md');
                    return (
                      <div className="flex flex-col h-full bg-[#08080a]">
                        <style dangerouslySetInnerHTML={{ __html: MARKDOWN_STYLES }} />
                        <div className="bg-[#0c0c0e]/80 border-b border-border-glass px-4 flex justify-between items-center select-none h-11 shrink-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs text-zinc-350 truncate" title={selectedFilePath}>{selectedFilePath}</span>
                            {isMarkdown ? (
                              <div className="flex bg-[#121215] border border-border-glass rounded p-0.5 h-7 items-center shrink-0">
                                <button
                                  onClick={() => setEditorTab('preview')}
                                  className={`text-[10px] px-2.5 h-full rounded transition-all cursor-pointer flex items-center justify-center ${
                                    editorTab === 'preview'
                                      ? 'bg-amber-500/15 text-amber-500 font-bold border border-amber-500/30'
                                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                                  }`}
                                >
                                  Preview
                                </button>
                                <button
                                  onClick={() => setEditorTab('edit')}
                                  className={`text-[10px] px-2.5 h-full rounded transition-all cursor-pointer flex items-center justify-center ${
                                    editorTab === 'edit'
                                      ? 'bg-amber-500/15 text-amber-500 font-bold border border-amber-500/30'
                                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                                  }`}
                                >
                                  Edit Source
                                </button>
                              </div>
                            ) : (
                              <span className="text-[9px] text-zinc-500 font-mono bg-[#101014] px-1.5 py-0.5 rounded border border-border-glass uppercase shrink-0">
                                {getLanguageFromPath(selectedFilePath)} (Editable)
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 shrink-0">
                            {saveStatus === 'saving' && <span className="text-xs text-zinc-500 animate-pulse">Saving...</span>}
                            {saveStatus === 'saved' && <span className="text-xs text-emerald-400">Saved!</span>}
                            {saveStatus === 'error' && <span className="text-xs text-rose-400">Failed to save!</span>}
                            {editedFileContent !== workspaceFileContent && (
                              <button
                                onClick={handleSave}
                                disabled={saveStatus === 'saving'}
                                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-bold text-[11px] px-3 h-7 flex items-center justify-center rounded transition-colors cursor-pointer"
                              >
                                Save Changes
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex-grow w-full bg-[#08080a] min-h-0 relative">
                          {isMarkdown && editorTab === 'preview' ? (
                            <div 
                              className="markdown-preview h-full overflow-y-auto px-8 py-6 text-[#ccccdd] text-sm leading-7 font-sans"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(editedFileContent) }}
                            />
                          ) : (
                            <Editor
                              height="100%"
                              language={getLanguageFromPath(selectedFilePath)}
                              value={editedFileContent}
                              onChange={(val) => setEditedFileContent(val || '')}
                              theme="vscode-dark"
                              onMount={(editor, monaco) => {
                                setEditorRef(editor);
                                setMonacoRef(monaco);
                              }}
                              beforeMount={(monaco) => {
                                monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                                  noSemanticValidation: true,
                                  noSyntaxValidation: true,
                                });
                                monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                                  noSemanticValidation: true,
                                  noSyntaxValidation: true,
                                });
                                monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                                  jsx: 1, // React
                                  allowNonTsExtensions: true,
                                });

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
                                minimap: { enabled: true },
                                fontSize: 13,
                                fontFamily: 'Consolas, "Courier New", monospace',
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
                          )}
                        </div>
                      </div>
                    );
                  }
                })()
              ) : (
                <div className="flex h-full w-full items-center justify-center border border-zinc-800 rounded-lg text-zinc-500 font-mono text-xs">
                  Select a file from the explorer sidebar to view.
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs">
            Select or load a changeset in the tree sidebar.
          </div>
        )}
      </div>

      {/* Recovery Dialog Modal overlay */}
      {showRecoveryDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0c0c0e] border border-zinc-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-rose-400">⚠️ Post-Apply Validation Failed</h3>
            <p className="text-xs text-zinc-350 leading-relaxed">
              The changeset was written to disk, but the validation layer detected compiler, linting, or unit test failures. How would you like to recover?
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button 
                onClick={handleRollback}
                className="w-full bg-rose-500 hover:bg-rose-600 text-white py-2 rounded font-medium text-xs cursor-pointer transition-colors"
              >
                Rollback Workspace (Safe)
              </button>
              <button 
                onClick={() => setShowRecoveryDialog(false)}
                className="w-full bg-[#121215] hover:bg-[#18181f] text-zinc-300 border border-zinc-800 py-2 rounded font-medium text-xs cursor-pointer transition-colors"
              >
                Keep Changes & View Errors
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

interface DirectoryTreeProps {
  dirPath: string; // Absolute path
  depth: number;
  repoPath: string;
  selectedFilePath: string | null;
  onFileSelect: (path: string, absolutePath: string) => void;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
  dirContents: Record<string, FileNode[]>;
}

export function DirectoryTree({
  dirPath,
  depth,
  repoPath,
  selectedFilePath,
  onFileSelect,
  expandedDirs,
  toggleDir,
  dirContents
}: DirectoryTreeProps) {
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
              <button
                onClick={() => toggleDir(node.path)}
                className="w-full text-left text-xs font-mono py-1.5 px-2 hover:bg-zinc-900/40 flex items-center transition-colors text-zinc-300 hover:text-zinc-100 cursor-pointer rounded-sm focus-visible:ring-1 focus-visible:ring-amber-500/50 outline-none"
                aria-expanded={isExpanded}
              >
                <span 
                  className="flex items-center gap-1.5"
                  style={{ paddingLeft: `${depth * 16}px` }}
                >
                  <ChevronDown
                    size={14}
                    className={`text-zinc-500 shrink-0 transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`}
                  />
                  {isExpanded ? (
                    <FolderOpen size={14} className="text-amber-500/80 fill-amber-500/10 shrink-0" />
                  ) : (
                    <Folder size={14} className="text-amber-500/80 fill-amber-500/10 shrink-0" />
                  )}
                  <span className="truncate">{node.name}</span>
                </span>
              </button>
              {isExpanded && (
                <DirectoryTree
                  dirPath={node.path}
                  depth={depth + 1}
                  repoPath={repoPath}
                  selectedFilePath={selectedFilePath}
                  onFileSelect={onFileSelect}
                  expandedDirs={expandedDirs}
                  toggleDir={toggleDir}
                  dirContents={dirContents}
                />
              )}
            </div>
          );
        } else {
          return (
            <button
              key={node.path}
              onClick={() => onFileSelect(relPath, node.path)}
              className={`w-full text-left text-xs font-mono py-1.5 px-2 flex items-center transition-colors cursor-pointer rounded-sm focus-visible:ring-1 focus-visible:ring-amber-500/50 outline-none ${
                isSelected 
                  ? 'bg-amber-500/10 text-amber-400 font-semibold border-l-2 border-amber-500' 
                  : 'text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
              }`}
            >
              <span 
                className="flex items-center gap-1.5"
                style={{ paddingLeft: `${depth * 16 + 20}px` }}
              >
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
