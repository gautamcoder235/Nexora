import React, { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Editor from '@monaco-editor/react';
import { Folder, FolderOpen, File, ChevronDown, ChevronRight, Play, CheckCircle2, XCircle, Loader2, Save, Terminal, Code, AlertTriangle } from 'lucide-react';
import { getLanguageFromPath } from '../../utils/language';

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}

interface ValidationStepResult {
  step_name: string;
  success: boolean;
  exit_code: number | null;
  duration_ms: number;
  output: string;
}

interface Props {
  repoPath: string; // Parent repo path
}

export function WorkspaceExplorer({ repoPath }: Props) {
  const [worktrees, setWorktrees] = useState<{ name: string; path: string; taskId: string; execId: string }[]>([]);
  const [selectedWorktreePath, setSelectedWorktreePath] = useState<string>('');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileAbsolutePath, setSelectedFileAbsolutePath] = useState<string | null>(null);
  const [workspaceFileContent, setWorkspaceFileContent] = useState<string>('');
  const [editedFileContent, setEditedFileContent] = useState<string>('');
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeSubTab, setActiveSubTab] = useState<'editor' | 'validation'>('editor');

  // Directory Tree state
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, FileNode[]>>({});

  // Contract data loaded from selected worktree
  const [contractData, setContractData] = useState<{
    taskId: string;
    executionId: string;
    taskTitle: string;
    taskDescription: string;
    allowedPatterns: string[];
  } | null>(null);

  // Validation States
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationResults, setValidationResults] = useState<ValidationStepResult[]>([]);
  const [selectedValidationStep, setSelectedValidationStep] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Helper to compute worktrees directory path
  const worktreesDir = useMemo(() => {
    const normPath = repoPath.replace(/\\/g, '/');
    const lastSlash = normPath.lastIndexOf('/');
    if (lastSlash === -1) return `${normPath}/../.nexora-worktrees`;
    const parent = normPath.substring(0, lastSlash);
    return `${parent}/.nexora-worktrees`;
  }, [repoPath]);

  // Load available worktrees
  const loadWorktrees = async () => {
    try {
      const nodes = await invoke<FileNode[]>('list_directory', { dirPath: worktreesDir });
      const wtList = nodes
        .filter(n => n.is_dir && n.name.startsWith('task-'))
        .map(n => {
          // Parse format: task-{task_id}-exec-{execution_id}
          const parts = n.name.split('-exec-');
          const taskId = parts[0].replace('task-', '');
          const execId = parts[1] || '';
          return {
            name: n.name,
            path: n.path,
            taskId,
            execId
          };
        });
      setWorktrees(wtList);
      if (wtList.length > 0 && !selectedWorktreePath) {
        setSelectedWorktreePath(wtList[0].path);
      }
    } catch (err) {
      console.warn("No worktrees found or failed to read .nexora-worktrees:", err);
      setWorktrees([]);
    }
  };

  useEffect(() => {
    loadWorktrees();
  }, [worktreesDir]);

  // Load contract details and root files when selected worktree changes
  useEffect(() => {
    if (!selectedWorktreePath) {
      setContractData(null);
      return;
    }

    const loadContract = async () => {
      try {
        const taskPath = `${selectedWorktreePath.replace(/\\/g, '/')}/.nexora/task.json`;
        const taskContent = await invoke<string>('read_project_file', { path: taskPath });
        const taskJson = JSON.parse(taskContent);

        const ownershipPath = `${selectedWorktreePath.replace(/\\/g, '/')}/.nexora/ownership.json`;
        const ownershipContent = await invoke<string>('read_project_file', { path: ownershipPath });
        const ownershipJson = JSON.parse(ownershipContent);

        setContractData({
          taskId: taskJson.task_id || '',
          executionId: taskJson.execution_id || '',
          taskTitle: taskJson.title || 'Untitled Task',
          taskDescription: taskJson.description || '',
          allowedPatterns: ownershipJson.owned_files || ['src/**']
        });
      } catch (err) {
        console.warn("Failed to load worktree contract data:", err);
        // Fallback using path details
        const folderName = selectedWorktreePath.split(/[\\/]/).pop() || '';
        const parts = folderName.split('-exec-');
        const taskId = parts[0].replace('task-', '');
        const execId = parts[1] || '';
        setContractData({
          taskId,
          executionId: execId,
          taskTitle: `Agent Session: ${execId}`,
          taskDescription: '',
          allowedPatterns: ['src/**']
        });
      }
    };

    loadContract();

    // Reset tree and content
    setSelectedFilePath(null);
    setSelectedFileAbsolutePath(null);
    setWorkspaceFileContent('');
    setEditedFileContent('');
    setExpandedDirs(new Set([selectedWorktreePath]));
    setDirContents({});
    setValidationResults([]);
    setSelectedValidationStep(null);
    setValidationError(null);

    // Load root directory contents
    const loadRoot = async () => {
      try {
        const nodes = await invoke<FileNode[]>('list_directory', { dirPath: selectedWorktreePath });
        setDirContents({ [selectedWorktreePath]: nodes });
      } catch (err) {
        console.error("Failed to list worktree root:", err);
      }
    };
    loadRoot();
  }, [selectedWorktreePath]);

  // Load selected file content
  useEffect(() => {
    if (!selectedFileAbsolutePath) return;
    const loadFile = async () => {
      setIsFileLoading(true);
      try {
        const content = await invoke<string>('read_project_file', { path: selectedFileAbsolutePath });
        setWorkspaceFileContent(content);
        setEditedFileContent(content);
      } catch (err) {
        console.error("Error reading file:", err);
        const errStr = `// Error loading file: ${err}`;
        setWorkspaceFileContent(errStr);
        setEditedFileContent(errStr);
      } finally {
        setIsFileLoading(false);
      }
    };
    loadFile();
  }, [selectedFileAbsolutePath]);

  // Directory toggle lazy loader
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
          setDirContents(prev => ({ ...prev, [dirPath]: nodes }));
        } catch (err) {
          console.error("Failed to list subdirectory:", err);
        }
      }
    }
  };

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
      console.error("Failed to save worktree file:", err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleRunValidation = async () => {
    if (!contractData || !selectedWorktreePath) return;
    setIsValidating(true);
    setValidationError(null);
    setValidationResults([]);
    setSelectedValidationStep(null);
    try {
      const results = await invoke<ValidationStepResult[]>('run_validation_async', {
        executionId: contractData.executionId,
        repoPath: repoPath,
        worktreePath: selectedWorktreePath,
        allowedPatterns: contractData.allowedPatterns
      });
      setValidationResults(results);
      if (results.length > 0) {
        setSelectedValidationStep(results[0].step_name);
      }
    } catch (err) {
      console.error("Validation failed to run:", err);
      setValidationError(String(err));
    } finally {
      setIsValidating(false);
    }
  };

  const selectedStepData = useMemo(() => {
    if (!selectedValidationStep) return null;
    return validationResults.find(r => r.step_name === selectedValidationStep) || null;
  }, [selectedValidationStep, validationResults]);

  return (
    <div className="flex h-full w-full bg-[#08080a] text-zinc-100 overflow-hidden font-sans">
      {/* Left Sidebar: Explorer & Selection */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-[#0c0c0e] shrink-0">
        
        {/* Worktree Dropdown Picker */}
        <div className="p-3 border-b border-zinc-800">
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Agent Worktree</label>
            <button 
              onClick={loadWorktrees}
              className="text-[9px] text-amber-500 hover:text-amber-400 font-semibold cursor-pointer"
            >
              Refresh
            </button>
          </div>
          <select 
            value={selectedWorktreePath} 
            onChange={(e) => setSelectedWorktreePath(e.target.value)}
            className="w-full bg-[#121215] border border-zinc-800 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500 text-zinc-300 outline-none"
          >
            {worktrees.length === 0 ? (
              <option value="">-- No Active Worktrees --</option>
            ) : (
              worktrees.map((wt) => (
                <option key={wt.path} value={wt.path}>
                  {wt.name.length > 25 ? `...${wt.name.slice(-22)}` : wt.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Contract Summary */}
        {contractData && (
          <div className="px-3 py-2 border-b border-zinc-800/80 bg-black/10 text-[10px] space-y-1">
            <div className="text-zinc-400 font-bold truncate" title={contractData.taskTitle}>
              📋 Task: {contractData.taskTitle}
            </div>
            <div className="text-zinc-500 font-mono truncate">
              ID: {contractData.taskId.slice(0, 8)} | Exec: {contractData.executionId.slice(0, 8)}
            </div>
          </div>
        )}

        {/* Tab selection */}
        <div className="px-3 h-10 border-b border-zinc-800 flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setActiveSubTab('editor')}
            className={`flex-1 h-7 flex items-center justify-center gap-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
              activeSubTab === 'editor'
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-500 font-bold'
                : 'text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent'
            }`}
          >
            <Code size={11} />
            Worktree Files
          </button>
          <button
            onClick={() => setActiveSubTab('validation')}
            className={`flex-1 h-7 flex items-center justify-center gap-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
              activeSubTab === 'validation'
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-500 font-bold'
                : 'text-zinc-400 hover:text-zinc-200 bg-transparent border border-transparent'
            }`}
          >
            <Terminal size={11} />
            Validation
          </button>
        </div>

        {/* Sub-tab: File Explorer */}
        {activeSubTab === 'editor' && (
          <div className="flex-grow overflow-y-auto p-3 space-y-1 scrollbar-thin">
            {selectedWorktreePath ? (
              <DirectoryTreeRecursive
                dirPath={selectedWorktreePath}
                depth={0}
                rootPath={selectedWorktreePath}
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
              <div className="flex items-center justify-center p-4 text-center text-zinc-500 text-xs font-mono">
                No active worktree selected.
              </div>
            )}
          </div>
        )}

        {/* Sub-tab: Validation Steps list */}
        {activeSubTab === 'validation' && (
          <div className="flex-grow overflow-y-auto p-3 space-y-2.5">
            <button
              onClick={handleRunValidation}
              disabled={isValidating || !selectedWorktreePath}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-black font-bold text-[11px] py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {isValidating ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Running Pipeline...
                </>
              ) : (
                <>
                  <Play size={11} className="fill-current" />
                  Run Local validation
                </>
              )}
            </button>

            {validationError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded space-y-1">
                <div className="flex items-center gap-1 font-bold">
                  <AlertTriangle size={12} />
                  Error Running Validation
                </div>
                <p className="font-mono text-[10px] break-all leading-normal">{validationError}</p>
              </div>
            )}

            <div className="space-y-1">
              {validationResults.map((step) => {
                const isSelected = selectedValidationStep === step.step_name;
                return (
                  <button
                    key={step.step_name}
                    onClick={() => setSelectedValidationStep(step.step_name)}
                    className={`w-full text-left p-2 rounded text-xs flex items-center justify-between border transition-all ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 font-semibold'
                        : 'bg-zinc-900/40 border-transparent hover:bg-zinc-800/40 text-zinc-350'
                    }`}
                  >
                    <span className="truncate">{step.step_name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {step.duration_ms}ms
                      </span>
                      {step.success ? (
                        <CheckCircle2 size={12} className="text-emerald-500" />
                      ) : (
                        <XCircle size={12} className="text-rose-500" />
                      )}
                    </div>
                  </button>
                );
              })}
              {validationResults.length === 0 && !isValidating && (
                <div className="text-zinc-500 text-xs italic text-center py-6 font-mono">
                  Validation run not started yet.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Content Viewport */}
      <div className="flex-grow flex flex-col min-w-0 bg-[#08080a] relative">
        {activeSubTab === 'editor' ? (
          selectedFilePath ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* File details bar */}
              <div className="bg-[#0c0c0e]/80 border-b border-zinc-800 px-4 flex justify-between items-center select-none h-11 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-zinc-350 truncate" title={selectedFilePath}>{selectedFilePath}</span>
                  <span className="text-[9px] text-zinc-500 font-mono bg-[#101014] px-1.5 py-0.5 rounded border border-zinc-800 uppercase shrink-0">
                    {getLanguageFromPath(selectedFilePath)} (Worktree)
                  </span>
                </div>
                
                <div className="flex items-center gap-3 shrink-0">
                  {saveStatus === 'saving' && <span className="text-xs text-zinc-500 animate-pulse font-mono">Saving...</span>}
                  {saveStatus === 'saved' && <span className="text-xs text-emerald-400 font-mono">Saved!</span>}
                  {saveStatus === 'error' && <span className="text-xs text-rose-400 font-mono">Failed to save!</span>}
                  {editedFileContent !== workspaceFileContent && (
                    <button
                      onClick={handleSave}
                      disabled={saveStatus === 'saving'}
                      className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-bold text-[11px] px-3 h-7 flex items-center justify-center rounded transition-colors cursor-pointer"
                    >
                      <Save size={12} className="mr-1.5" />
                      Save to Worktree
                    </button>
                  )}
                </div>
              </div>

              {/* Monaco Editor Container */}
              <div className="flex-grow w-full bg-[#08080a] min-h-0 relative">
                {isFileLoading ? (
                  <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs bg-[#08080a]">
                    <Loader2 size={16} className="animate-spin text-amber-500 mr-2" />
                    Loading file from worktree...
                  </div>
                ) : (
                  <Editor
                    height="100%"
                    language={getLanguageFromPath(selectedFilePath)}
                    value={editedFileContent}
                    onChange={(val) => setEditedFileContent(val || '')}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: true },
                      fontSize: 13,
                      fontFamily: 'Consolas, "Courier New", monospace',
                      lineNumbers: 'on',
                      folding: true,
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      readOnly: false,
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs p-6 text-center">
              Select a worktree file from the sidebar tree to edit.
            </div>
          )
        ) : (
          /* Validation stdout console output */
          selectedStepData ? (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="bg-[#0c0c0e]/80 border-b border-zinc-800 px-4 flex justify-between items-center select-none h-11 shrink-0">
                <div className="flex items-center gap-2">
                  <Terminal size={13} className="text-amber-500" />
                  <span className="font-mono text-xs text-zinc-200">Terminal Validation Output: {selectedStepData.step_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 font-mono">Exit Code: {selectedStepData.exit_code !== null ? selectedStepData.exit_code : 'N/A'}</span>
                  <div className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase font-mono ${
                    selectedStepData.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {selectedStepData.success ? 'Passed' : 'Failed'}
                  </div>
                </div>
              </div>
              
              <div className="flex-grow bg-black p-4 overflow-y-auto font-mono text-xs text-amber-500/80 leading-normal selection:bg-amber-500/20 selection:text-amber-400">
                <pre className="whitespace-pre-wrap break-all select-text">
                  {selectedStepData.output || 'Step executed successfully with no output.'}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-500 font-mono text-xs p-6 text-center">
              Select a validation step from the sidebar to inspect its output.
            </div>
          )
        )}
      </div>
    </div>
  );
}

// Recursive directory tree renderer
interface DirectoryTreeRecursiveProps {
  dirPath: string;
  depth: number;
  rootPath: string;
  selectedFilePath: string | null;
  onFileSelect: (path: string, absolutePath: string) => void;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
  dirContents: Record<string, FileNode[]>;
}

function DirectoryTreeRecursive({
  dirPath,
  depth,
  rootPath,
  selectedFilePath,
  onFileSelect,
  expandedDirs,
  toggleDir,
  dirContents
}: DirectoryTreeRecursiveProps) {
  const children = dirContents[dirPath] || [];

  const getRelativePath = (absolutePath: string) => {
    const normPath = absolutePath.replace(/\\/g, '/');
    const normRoot = rootPath.replace(/\\/g, '/');
    const prefix = normRoot.endsWith('/') ? normRoot : `${normRoot}/`;
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
                className="w-full text-left text-xs font-mono py-1.5 px-2 hover:bg-zinc-900/40 flex items-center transition-colors text-zinc-300 hover:text-zinc-100 cursor-pointer rounded-sm outline-none"
              >
                <span 
                  className="flex items-center gap-1.5"
                  style={{ paddingLeft: `${depth * 14}px` }}
                >
                  <ChevronDown
                    size={12}
                    className={`text-zinc-500 shrink-0 transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`}
                  />
                  {isExpanded ? (
                    <FolderOpen size={13} className="text-amber-500/80 fill-amber-500/10 shrink-0" />
                  ) : (
                    <Folder size={13} className="text-amber-500/80 fill-amber-500/10 shrink-0" />
                  )}
                  <span className="truncate">{node.name}</span>
                </span>
              </button>
              {isExpanded && (
                <DirectoryTreeRecursive
                  dirPath={node.path}
                  depth={depth + 1}
                  rootPath={rootPath}
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
          // Skip .git and contract JSON files in display if preferred, but keeping them allows inspecting contracts
          if (node.name === '.git') return null;

          return (
            <button
              key={node.path}
              onClick={() => onFileSelect(relPath, node.path)}
              className={`w-full text-left text-xs font-mono py-1 px-2 flex items-center transition-colors cursor-pointer rounded-sm outline-none ${
                isSelected 
                  ? 'bg-amber-500/10 text-amber-400 font-semibold border-l-2 border-amber-500' 
                  : 'text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
              }`}
            >
              <span 
                className="flex items-center gap-1.5"
                style={{ paddingLeft: `${depth * 14 + 16}px` }}
              >
                <File size={13} className="text-zinc-500 shrink-0" />
                <span className="truncate">{node.name}</span>
              </span>
            </button>
          );
        }
      })}
    </div>
  );
}
