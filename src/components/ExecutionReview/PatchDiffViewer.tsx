import React, { useState, useEffect } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { ArtifactInfo } from '../../types/executionReview';
import { getLanguageFromPath } from '../../utils/language';

interface Props {
  artifacts?: ArtifactInfo[];
  originalContent?: string;
  proposedContent?: string;
  filePath?: string;
}

export function PatchDiffViewer({ artifacts, originalContent, proposedContent, filePath }: Props) {
  const [viewMode, setViewMode] = useState<'inline' | 'split'>('split');
  const [patchContent, setPatchContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!artifacts) return;
    const patchArtifact = artifacts.find(a => a.artifact_type === 'patch');
    if (!patchArtifact) return;

    const loadPatch = async () => {
      setIsLoading(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const content = await invoke<string>('read_project_file', { path: patchArtifact.file_path });
        setPatchContent(content);
      } catch (err) {
        console.error("Error reading patch content for viewer:", err);
        setPatchContent(`Error loading patch:\n${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadPatch();
  }, [artifacts]);

  if (artifacts) {
    const patchArtifact = artifacts.find(a => a.artifact_type === 'patch');
    if (!patchArtifact) {
      return (
        <div className="solid-dark-diff border border-border-glass rounded-lg p-8 text-center text-zinc-500 font-mono text-xs">
          No patch artifact generated for this execution.
        </div>
      );
    }
    return (
      <div className="solid-dark-diff border border-border-glass rounded-lg overflow-hidden flex flex-col bg-[#050507]">
        <div className="bg-bg-secondary/40 border-b border-border-glass px-4 flex justify-between items-center select-none h-11 shrink-0">
          <h4 className="text-xs font-semibold text-zinc-350">Generated Patch</h4>
        </div>
        <div className="h-96 w-full relative border-t border-border-glass bg-[#08080a]">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center text-white">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent-primary"></div>
            </div>
          ) : (
            <Editor
              height="100%"
              language="diff"
              value={patchContent}
              options={{
                readOnly: true,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                fontSize: 12,
                fontFamily: 'Consolas, "Courier New", monospace',
                lineNumbers: 'on',
                folding: true,
                automaticLayout: true,
              }}
              theme="vscode-dark"
            />
          )}
        </div>
      </div>
    );
  }

  const activeFilePath = filePath || 'unknown.txt';
  const language = getLanguageFromPath(activeFilePath);

  return (
    <div className="flex flex-col h-full w-full bg-[#08080a]">
      <div className="bg-bg-secondary/40 border-b border-border-glass px-4 flex justify-between items-center select-none h-11 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs text-zinc-300 truncate" title={activeFilePath}>{activeFilePath}</span>
          <span className="text-[9px] text-zinc-500 font-mono bg-[#101014] px-1.5 py-0.5 rounded border border-border-glass uppercase shrink-0">
            {language}
          </span>
        </div>
        <div className="flex bg-[#050507] rounded border border-border-glass p-0.5 h-7 items-center shrink-0">
          <button 
            className={`px-3 h-full flex items-center justify-center text-xs rounded transition-all cursor-pointer border ${viewMode === 'inline' ? 'bg-bg-primary text-white border-border-glass' : 'border-transparent text-zinc-500 hover:text-zinc-350'}`}
            onClick={() => setViewMode('inline')}
          >
            Inline
          </button>
          <button 
            className={`px-3 h-full flex items-center justify-center text-xs rounded transition-all cursor-pointer border ${viewMode === 'split' ? 'bg-bg-primary text-white border-border-glass' : 'border-transparent text-zinc-500 hover:text-zinc-350'}`}
            onClick={() => setViewMode('split')}
          >
            Side-by-Side
          </button>
        </div>
      </div>
      <div className="flex-grow w-full bg-[#08080a] min-h-0">
        <DiffEditor
          language={language}
          original={originalContent || ''}
          modified={proposedContent || ''}
          theme="vscode-dark"
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
            renderSideBySide: viewMode === 'split',
            useInlineViewWhenSpaceIsLimited: false,
            readOnly: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: 'Consolas, "Courier New", monospace',
            lineNumbers: 'on',
            folding: true,
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
    </div>
  );
}
