import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useChangesetStore } from '../../stores/changesetStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { X, ChevronRight, ChevronDown, Folder, FolderOpen, File, RefreshCw } from 'lucide-react';
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

export function AgentReviewCenter({ repoPath, onClose }: Props) {
  const activeTab = useChangesetStore(s => s.activeReviewTab);
  const setActiveTab = useChangesetStore(s => s.setActiveReviewTab);

  const ucteChanges = useChangesetStore(s => s.ucteChanges);
  const isScanningUcte = useChangesetStore(s => s.isScanningUcte);
  const scanUcteChanges = useChangesetStore(s => s.scanUcteChanges);
  const scanSingleFileUcte = useChangesetStore(s => s.scanSingleFileUcte);

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

  const [editedFileContent, setEditedFileContent] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Diff states
  const [originalContent, setOriginalContent] = useState<string>('');
  const [modifiedContent, setModifiedContent] = useState<string>('');
  const [isDiffLoading, setIsDiffLoading] = useState<boolean>(false);

  // Load changes on mount
  useEffect(() => {
    scanUcteChanges(repoPath).catch(err => console.error("Initial UCTE scan failed:", err));
  }, [repoPath]);

  // Load file content when selection changes
  useEffect(() => {
    if (!selectedFilePath || !selectedFileAbsolutePath) {
      setOriginalContent('');
      setModifiedContent('');
      return;
    }

    const isChanged = ucteChanges.includes(selectedFilePath);
    if (!isChanged) {
      setIsFileLoading(true);
      invoke<string>('read_project_file', { path: selectedFileAbsolutePath })
        .then((content) => {
          setWorkspaceFileContent(content);
          setEditedFileContent(content);
          setIsFileLoading(false);
        })
        .catch((err) => {
          console.error("Failed to read file:", err);
          setIsFileLoading(false);
        });
      return;
    }

    setIsDiffLoading(true);
    Promise.all([
      invoke<string>('read_original_file', { path: selectedFileAbsolutePath }).catch((err) => {
        console.warn("Failed to read original file from git:", err);
        return '';
      }),
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
        console.error("Failed to read original or project file for diff:", err);
        setIsDiffLoading(false);
      });
  }, [selectedFilePath, selectedFileAbsolutePath, ucteChanges]);

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
      
      // Rescan the file to check if changes are resolved
      scanSingleFileUcte(repoPath, selectedFilePath!);
    } catch (err) {
      console.error("Failed to save project file:", err);
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

  return (
    <div className="h-full w-full flex bg-[#0c0c0e] text-zinc-150 select-none overflow-hidden font-sans border border-[#1b1b22] rounded-xl shadow-2xl">
      {/* Sidebar (File Explorer / Changes list) */}
      <div className="w-64 border-r border-[#1B1B22] flex flex-col bg-[#0D0D10] shrink-0">
        
        {/* Sidebar Header */}
        <div className="p-3 border-b border-[#1B1B22] flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Review Center</span>
          <button 
            onClick={onClose} 
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-[#1B1B22] transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tabs for Sidebar content */}
        <div className="flex items-center gap-0.5 p-1 bg-[#09090b] border-b border-[#1B1B22] shrink-0">
          <button
            onClick={() => setActiveTab('changeset')}
            className={`flex-1 h-7 flex items-center justify-center rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'changeset'
                ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF]'
                : 'text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent'
            }`}
          >
            File Changes
          </button>
          <button
            onClick={() => setActiveTab('workspace')}
            className={`flex-1 h-7 flex items-center justify-center rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'workspace'
                ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF]'
                : 'text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent'
            }`}
          >
            Project Files
          </button>
        </div>

        {/* Sidebar Scrollable Area */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'changeset' ? (
            <div className="flex flex-col h-full">
              {/* Scan All Controls */}
              <div className="p-3 border-b border-[#1B1B22] flex items-center justify-between shrink-0 bg-[#09090b]/40">
                <span className="text-[10px] text-zinc-500 font-mono">UCTE Live Watcher</span>
                <button
                  onClick={() => scanUcteChanges(repoPath)}
                  disabled={isScanningUcte}
                  className="flex items-center gap-1 bg-[#7C5CFF] hover:bg-[#7C5CFF]/90 disabled:opacity-50 text-white text-[9px] font-bold py-1 px-2.5 rounded transition-all cursor-pointer select-none"
                >
                  <RefreshCw size={10} className={`${isScanningUcte ? 'animate-spin' : ''}`} />
                  <span>Scan Changes</span>
                </button>
              </div>

              {/* Changes List */}
              <div className="p-2 space-y-1">
                {ucteChanges.map((file) => {
                  const isSelected = selectedFilePath === file;
                  return (
                    <div
                      key={file}
                      onClick={() => {
                        setSelectedFilePath(file);
                        setSelectedFileAbsolutePath(`${repoPath}/${file}`);
                      }}
                      className={`w-full text-left text-xs font-mono py-1.5 px-2 rounded-sm flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-[#7C5CFF]/10 text-[#7C5CFF] font-semibold border-l-2 border-[#7C5CFF]' 
                          : 'text-zinc-400 hover:bg-zinc-900/60'
                      }`}
                    >
                      <span className="truncate pr-2">{file}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          scanSingleFileUcte(repoPath, file);
                        }}
                        disabled={isScanningUcte}
                        className="text-[8px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-1 rounded hover:border-[#7C5CFF]/40 hover:text-zinc-200 transition-all select-none shrink-0"
                      >
                        Scan
                      </button>
                    </div>
                  );
                })}
                {ucteChanges.length === 0 && (
                  <div className="text-center text-zinc-600 italic text-[10px] py-8">
                    No file changes detected.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-1">
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
                          <ChevronDown
                            size={14}
                            className={`text-zinc-500 shrink-0 transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`}
                          />
                          {isExpanded ? (
                            <FolderOpen size={14} className="text-[#7C5CFF]/80 fill-[#7C5CFF]/10 shrink-0" />
                          ) : (
                            <Folder size={14} className="text-[#7C5CFF]/80 fill-[#7C5CFF]/10 shrink-0" />
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
                    setSelectedFilePath(path);
                    setSelectedFileAbsolutePath(absolutePath);
                  }}
                  expandedDirs={expandedDirs}
                  toggleDir={toggleDir}
                  dirContents={dirContents}
                />
              ) : (
                <div className="text-center text-zinc-600 italic text-[10px] py-8">
                  No workspace path available.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Viewport Area */}
      <div className="flex-grow flex flex-col min-w-0 bg-[#08080a] overflow-hidden">
        {selectedFilePath ? (
          <div className="flex-grow flex flex-col h-full overflow-hidden">
            {/* Viewport Header */}
            <div className="bg-[#0D0D10] border-b border-[#1B1B22] px-4 flex justify-between items-center select-none h-11 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs text-zinc-300 truncate" title={selectedFilePath}>{selectedFilePath}</span>
                {ucteChanges.includes(selectedFilePath) && (
                  <span className="text-[8px] tracking-wide uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold font-mono">
                    Modified (Split Diff)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {saveStatus === 'saving' && <span className="text-xs text-zinc-500 animate-pulse">Saving...</span>}
                {saveStatus === 'saved' && <span className="text-xs text-emerald-400 font-semibold">Saved!</span>}
                {saveStatus === 'error' && <span className="text-xs text-rose-400 font-semibold">Failed to save!</span>}
                
                {/* Save button only when editing in non-diff mode */}
                {!ucteChanges.includes(selectedFilePath) && editedFileContent !== workspaceFileContent && (
                  <button
                    onClick={handleSave}
                    disabled={saveStatus === 'saving'}
                    className="bg-[#7C5CFF] hover:bg-[#7C5CFF]/90 disabled:opacity-50 text-white font-bold text-[11px] px-3 h-7 flex items-center justify-center rounded transition-colors cursor-pointer select-none"
                  >
                    Save Changes
                  </button>
                )}
              </div>
            </div>

            {/* Monaco Container */}
            <div className="flex-grow w-full min-h-0 relative">
              {ucteChanges.includes(selectedFilePath) ? (
                isDiffLoading ? (
                  <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs bg-[#08080a]">
                    <RefreshCw className="animate-spin mr-2" size={14} />
                    <span>Loading git diff contents...</span>
                  </div>
                ) : (
                  <DiffEditor
                    height="100%"
                    original={originalContent}
                    modified={modifiedContent}
                    language={getLanguageFromPath(selectedFilePath)}
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
                  <RefreshCw className="animate-spin mr-2" size={14} />
                  <span>Loading file...</span>
                </div>
              ) : (
                <Editor
                  height="100%"
                  language={getLanguageFromPath(selectedFilePath)}
                  value={editedFileContent}
                  onChange={(val) => setEditedFileContent(val || '')}
                  theme="vs-dark"
                  options={{
                    readOnly: false,
                    minimap: { enabled: settings?.appearance?.workspace?.showMinimap ?? false },
                    fontSize: settings?.appearance?.typography?.codeFontSize ?? 12,
                    fontFamily: settings?.appearance?.typography?.codeFontFamily ?? "'JetBrains Mono', monospace",
                    lineNumbers: 'on',
                    folding: true,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs">
            Select a file from the explorer sidebar to view.
          </div>
        )}
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
                className="w-full text-left text-xs font-mono py-1.5 px-2 hover:bg-zinc-900/40 flex items-center transition-colors text-zinc-300 hover:text-zinc-100 cursor-pointer rounded-sm focus-visible:ring-1 focus-visible:ring-blue-500/50 outline-none"
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
                    <FolderOpen size={14} className="text-[#7C5CFF]/80 fill-[#7C5CFF]/10 shrink-0" />
                  ) : (
                    <Folder size={14} className="text-[#7C5CFF]/80 fill-[#7C5CFF]/10 shrink-0" />
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
              className={`w-full text-left text-xs font-mono py-1.5 px-2 flex items-center transition-colors cursor-pointer rounded-sm focus-visible:ring-1 focus-visible:ring-blue-500/50 outline-none ${
                isSelected 
                  ? 'bg-[#7C5CFF]/10 text-[#7C5CFF] font-semibold border-l-2 border-[#7C5CFF]' 
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
