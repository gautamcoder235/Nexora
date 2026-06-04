/**
 * Multi Vibe — TerminalPane Component
 *
 * Renders a Warp-style block-based terminal view.
 * Handles PTY I/O, parses output into command blocks, and renders the command input editor.
 */
import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTerminalStore } from '../../stores/terminalStore';
import { BlockList } from './BlockList';
import { TerminalInput } from './TerminalInput';
import { BlockParser } from '../../lib/terminal/blockParser';
import type { TerminalBlock } from '../../types/terminal';
import './TerminalPane.css';

interface TerminalPaneProps {
  paneId: string;
  isFocused: boolean;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ paneId, isFocused }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentCwd, setCurrentCwd] = useState('E:\\Codes\\BridgeSpace');
  
  const sessions = useTerminalStore((s) => s.sessions);
  const createSessionStore = useTerminalStore((s) => s.createSession);
  const addBlock = useTerminalStore((s) => s.addBlock);
  const appendBlockOutput = useTerminalStore((s) => s.appendBlockOutput);
  const updateBlockStatus = useTerminalStore((s) => s.updateBlockStatus);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);

  const activeBlockIdRef = useRef<string | null>(null);
  const session = sessionId ? sessions.get(sessionId) : null;

  // Initialize PTY Session on mount
  useEffect(() => {
    let unlistenOutput: (() => void) | null = null;
    const parser = new BlockParser();

    const init = async () => {
      try {
        // Connect to the orchestrator-spawned backend PTY session ID
        const sId = paneId;
        setSessionId(sId);
        setActiveSession(sId);

        // Register session in Zustand store if it doesn't exist
        if (!sessions.has(sId)) {
          createSessionStore({
            id: sId,
            shell: 'powershell',
            shellName: 'PowerShell',
            blocks: [],
            activeBlockId: null,
            cwd: currentCwd,
            isConnected: true,
            createdAt: new Date(),
          });

          // Create initial startup block
          const startupBlockId = `startup-${Date.now()}`;
          activeBlockIdRef.current = startupBlockId;
          addBlock(sId, {
            id: startupBlockId,
            command: 'System Boot',
            output: '',
            status: 'running',
            exitCode: null,
            startTime: new Date(),
            endTime: null,
            pwd: currentCwd,
            gitBranch: null,
            isBookmarked: false,
            isCollapsed: false,
            agentId: null,
            duration: null,
          });
        }

        // Helper to check if text contains typical shell prompt endings
        const isPrompt = (text: string): boolean => {
          const trimmed = text.trim();
          return trimmed.endsWith('>') || trimmed.endsWith('$') || trimmed.endsWith('%') || trimmed.endsWith('#');
        };

        // Listen to output event from backend PTY session (terminal:stdout)
        unlistenOutput = await listen<{ sessionId: string; data: string }>(
          'terminal:stdout',
          (event) => {
            if (event.payload.sessionId !== sId) return;

            const rawChunk = event.payload.data;
            
            // Write to the current active block
            const currentActiveBlockId = activeBlockIdRef.current;
            if (currentActiveBlockId) {
              appendBlockOutput(sId, currentActiveBlockId, rawChunk);
              
              // Fallback logic: if PTY outputs a prompt-like suffix, mark command as finished
              if (isPrompt(rawChunk) && currentActiveBlockId !== `startup-${Date.now()}`) {
                updateBlockStatus(sId, currentActiveBlockId, 'success', 0);
              }
            }

            // Also check for OSC 133 markers using our stream parser
            const events = parser.parse(rawChunk);
            for (const ev of events) {
              switch (ev.type) {
                case 'command-done':
                  if (activeBlockIdRef.current) {
                    updateBlockStatus(sId, activeBlockIdRef.current, ev.exitCode === 0 ? 'success' : 'error', ev.exitCode);
                    activeBlockIdRef.current = null;
                  }
                  break;
                default:
                  break;
              }
            }
          }
        );
      } catch (err) {
        console.error('Failed to initialize block PTY session:', err);
      }
    };

    init();

    // Clean up session and listeners on unmount
    return () => {
      if (unlistenOutput) {
        unlistenOutput();
      }
    };
  }, [paneId]);

  // Sync active session focus
  useEffect(() => {
    if (isFocused && sessionId) {
      setActiveSession(sessionId);
    }
  }, [isFocused, sessionId]);

  // Submit typed command to backend PTY
  const handleCommandSubmit = async (command: string) => {
    if (!sessionId) return;

    // Detect CWD shifts (like cd codes) to update directory display
    if (command.trim().startsWith('cd ')) {
      const targetDir = command.trim().slice(3).replace(/["']/g, '');
      // Try to evaluate new path (simple simulation of path traversal)
      let nextDir = currentCwd;
      if (targetDir === '..') {
        const parts = currentCwd.split(/[\\/]/).filter(Boolean);
        if (parts.length > 1) {
          nextDir = parts.slice(0, -1).join('\\');
        }
      } else if (!targetDir.includes(':')) {
        nextDir = `${currentCwd}\\${targetDir}`;
      } else {
        nextDir = targetDir;
      }
      setCurrentCwd(nextDir);
    }

    const blockId = `block-${Date.now()}`;
    activeBlockIdRef.current = blockId;

    // Create block for this command
    const newBlock: TerminalBlock = {
      id: blockId,
      command,
      output: '',
      status: 'running',
      exitCode: null,
      startTime: new Date(),
      endTime: null,
      pwd: currentCwd,
      gitBranch: null,
      isBookmarked: false,
      isCollapsed: false,
      agentId: null,
      duration: null,
    };

    addBlock(sessionId, newBlock);

    // Write command to backend PTY
    try {
      await invoke('write_pty', {
        sessionId,
        data: `${command}\r\n`,
      });
    } catch (err) {
      console.error('Failed to send command to PTY:', err);
      appendBlockOutput(sessionId, blockId, `\r\n\x1b[31m[Error] Failed to execute command: ${err}\x1b[0m\r\n`);
      updateBlockStatus(sessionId, blockId, 'error', 1);
      activeBlockIdRef.current = null;
    }
  };

  return (
    <div className="terminal-pane">
      <BlockList sessionId={sessionId || ''} blocks={session?.blocks || []} />
      <TerminalInput onSubmit={handleCommandSubmit} cwd={currentCwd} />
    </div>
  );
};
