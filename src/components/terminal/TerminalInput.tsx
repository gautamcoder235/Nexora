/**
 * Multi Vibe — TerminalInput Component
 *
 * Warp-style terminal command entry editor.
 * Separate from command blocks, supporting history and future autocomplete features.
 */
import React, { useState, useRef, useEffect } from 'react';
import './TerminalInput.css';

interface TerminalInputProps {
  onSubmit: (command: string) => void;
  cwd: string;
}

export const TerminalInput: React.FC<TerminalInputProps> = ({ onSubmit, cwd }) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const command = value.trim();
      if (command) {
        onSubmit(command);
        setValue('');
      }
    }
  };

  const getDisplayCwd = () => {
    if (!cwd) return '~/';
    // Get just the last directory name
    const parts = cwd.split(/[\\/]/).filter(Boolean);
    return parts.length > 0 ? `${parts[parts.length - 1]}/` : '~/';
  };

  return (
    <div className="terminal-input">
      <div className="terminal-input__prompt font-mono text-sm">
        <span className="terminal-input__folder text-accent">{getDisplayCwd()}</span>
        <span className="terminal-input__arrow text-muted">❯</span>
      </div>
      
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a command... (use Shift+Enter for multi-line, Enter to run)"
        className="terminal-input__editor font-mono text-sm"
        autoFocus
      />
      
      <div className="terminal-input__right">
        <button 
          className="glass-button glass-button--sm terminal-input__ai-btn"
          title="AI Command Search (Ctrl+Space)"
        >
          <span>✨ Ask AI</span>
        </button>
      </div>
    </div>
  );
};
