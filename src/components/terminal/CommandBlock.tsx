/**
 * Nexora — CommandBlock Component
 *
 * Renders an isolated Warp-style terminal command block.
 * Uses xterm.js to render ANSI-compliant output with colors and formatting.
 */
import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { TerminalBlock } from '../../types/terminal';
import { useTerminalStore } from '../../stores/terminalStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { ThemeManager } from '../../services/ThemeManager';
import './CommandBlock.css';

interface CommandBlockProps {
  sessionId: string;
  block: TerminalBlock;
}

export const CommandBlock: React.FC<CommandBlockProps> = ({ sessionId, block }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const toggleCollapse = useTerminalStore((s) => s.toggleBlockCollapse);
  const toggleBookmark = useTerminalStore((s) => s.toggleBlockBookmark);
  const settings = useOrchestratorStore((s) => s.settings);

  // Initialize block-specific xterm.js instance
  useEffect(() => {
    if (block.isCollapsed || !containerRef.current) {
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
      return;
    }

    const activeTheme = ThemeManager.getTheme(settings.appearance?.theme?.theme || 'Midnight');
    const termTheme = activeTheme.terminal;

    const term = new Terminal({
      cursorBlink: false,
      cursorInactiveStyle: 'none',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      theme: {
        background: 'transparent',
        foreground: termTheme.foreground,
        black: termTheme.black,
        red: termTheme.red,
        green: termTheme.green,
        yellow: termTheme.yellow,
        blue: termTheme.blue,
        magenta: termTheme.magenta,
        cyan: termTheme.cyan,
        white: termTheme.white,
        brightBlack: termTheme.brightBlack,
        brightRed: termTheme.brightRed,
        brightGreen: termTheme.brightGreen,
        brightYellow: termTheme.brightYellow,
        brightBlue: termTheme.brightBlue,
        brightMagenta: termTheme.brightMagenta,
        brightCyan: termTheme.brightCyan,
        brightWhite: termTheme.brightWhite,
      },
      rows: Math.min(40, Math.max(3, block.output.split('\n').length)),
      allowProposedApi: true,
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(containerRef.current);
    term.write(block.output);

    // Helper to resize columns to container width while setting rows to output height
    const fitColumns = () => {
      try {
        const dims = fitAddon.proposeDimensions();
        const lineCount = Math.min(40, Math.max(3, block.output.split('\n').length));
        if (dims) {
          term.resize(dims.cols, lineCount);
        } else {
          term.resize(80, lineCount);
        }
      } catch (e) {
        // ignore transient errors
      }
    };

    fitColumns();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Resize observer to ensure the block output fits when window resizing occurs
    const resizeObserver = new ResizeObserver(() => {
      fitColumns();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [block.isCollapsed]);

  // Dynamic terminal theme updates on theme switch for blocks
  useEffect(() => {
    if (!termRef.current) return;
    const activeTheme = ThemeManager.getTheme(settings.appearance?.theme?.theme || 'Midnight');
    const termTheme = activeTheme.terminal;
    termRef.current.options.theme = {
      background: 'transparent',
      foreground: termTheme.foreground,
      black: termTheme.black,
      red: termTheme.red,
      green: termTheme.green,
      yellow: termTheme.yellow,
      blue: termTheme.blue,
      magenta: termTheme.magenta,
      cyan: termTheme.cyan,
      white: termTheme.white,
      brightBlack: termTheme.brightBlack,
      brightRed: termTheme.brightRed,
      brightGreen: termTheme.brightGreen,
      brightYellow: termTheme.brightYellow,
      brightBlue: termTheme.brightBlue,
      brightMagenta: termTheme.brightMagenta,
      brightCyan: termTheme.brightCyan,
      brightWhite: termTheme.brightWhite,
    };
  }, [settings.appearance?.theme]);

  // Update output if it changes (when command is running)
  useEffect(() => {
    if (termRef.current && !block.isCollapsed) {
      // Clear and re-write to handle stream parsing correctly
      termRef.current.clear();
      termRef.current.write(block.output);
      
      // Update row size dynamically to fit the new lines
      const lineCount = Math.min(50, Math.max(3, block.output.split('\n').length));
      try {
        const dims = fitAddonRef.current?.proposeDimensions();
        if (dims) {
          termRef.current.resize(dims.cols, lineCount);
        } else {
          termRef.current.resize(termRef.current.cols, lineCount);
        }
      } catch (e) {
        termRef.current.resize(termRef.current.cols, lineCount);
      }
    }
  }, [block.output, block.isCollapsed]);

  const getStatusClass = () => {
    switch (block.status) {
      case 'running': return 'command-block--running';
      case 'success': return 'command-block--success';
      case 'error': return 'command-block--error';
      default: return '';
    }
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const handleCopyOutput = () => {
    // Strip ANSI codes before copying to clipboard
    const cleanText = block.output.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    navigator.clipboard.writeText(cleanText);
  };

  return (
    <div className={`glass-card command-block ${getStatusClass()} animate-block-appear`}>
      <div className="command-block__header font-mono text-xs text-muted">
        <div className="command-block__header-left">
          <span className="status-dot status-dot--running" style={{ display: block.status === 'running' ? 'inline-block' : 'none' }} />
          <span className="status-dot status-dot--success" style={{ display: block.status === 'success' ? 'inline-block' : 'none' }} />
          <span className="status-dot status-dot--error" style={{ display: block.status === 'error' ? 'inline-block' : 'none' }} />
          
          <span className="command-block__pwd">{block.pwd}</span>
          {block.gitBranch && (
            <span className="command-block__branch text-accent">
              ⎇ {block.gitBranch}
            </span>
          )}
        </div>
        
        <div className="command-block__header-right">
          {block.duration !== null && (
            <span className="command-block__duration">{formatDuration(block.duration)}</span>
          )}
          {block.exitCode !== null && (
            <span className="command-block__exit-code">exit {block.exitCode}</span>
          )}
          <button 
            className="command-block__btn" 
            onClick={() => toggleBookmark(sessionId, block.id)}
            title={block.isBookmarked ? "Remove Bookmark" : "Bookmark Block"}
          >
            {block.isBookmarked ? '★' : '☆'}
          </button>
          <button 
            className="command-block__btn" 
            onClick={() => toggleCollapse(sessionId, block.id)}
            title={block.isCollapsed ? "Expand Output" : "Collapse Output"}
          >
            {block.isCollapsed ? '＋' : '－'}
          </button>
        </div>
      </div>

      <div className="command-block__cmd font-mono text-md">
        <span className="command-block__prompt text-accent">$</span> {block.command}
      </div>

      {!block.isCollapsed && (
        <div className="command-block__output-container">
          <div ref={containerRef} className="command-block__output" />
          <div className="command-block__actions">
            <button 
              className="glass-button glass-button--sm command-block__action"
              onClick={handleCopyOutput}
            >
              Copy Clean Output
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
