import React, { useState } from 'react';
import { Trash2, CheckCircle2, AlertCircle, Download, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface CliEditorCardProps {
  cli: any; // normalized { id, name, cliCommand, defaultArgs, group, projectId, rolePreset, capabilities, startupInstructions }
  isCustom: boolean;
  isInstalled?: boolean;
  checking?: boolean;
  installHelp?: boolean;

  onUpdate: (field: string, value: any) => void;
  onDelete?: () => void;
  onCheck?: () => void;
  onInstall?: () => void;
}

export const CliEditorCard: React.FC<CliEditorCardProps> = ({
  cli,
  isCustom,
  isInstalled,
  checking,
  installHelp,

  onUpdate,
  onDelete,
  onCheck,
  onInstall
}) => {
  const caps = cli.capabilities || { coding: true, testing: false, review: false, planning: false };
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="p-4 bg-[#16161a] border border-[#2d2d35] rounded space-y-0 relative group">
      <div 
        className={`flex items-center justify-between cursor-pointer ${isExpanded ? 'border-b border-[#232329] pb-3 mb-3' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
          <h5 className="text-sm font-medium text-sky-400">{cli.name || 'Unnamed CLI'}</h5>
        </div>
        <div className="flex items-center gap-2">
          {isInstalled === true && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 size={12}/> Installed</span>}
          {isInstalled === false && <span className="flex items-center gap-1 text-xs text-rose-400"><AlertCircle size={12}/> Missing</span>}
          
          {onCheck && (
            <button 
              onClick={(e) => { e.stopPropagation(); onCheck(); }}
              disabled={checking}
              className="px-2 py-1 flex items-center gap-1 text-xs bg-[#232329] hover:bg-[#2d2d35] text-zinc-300 rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={checking ? "animate-spin" : ""} /> Check
            </button>
          )}
          
          {installHelp && onInstall && (
            <button 
              onClick={(e) => { e.stopPropagation(); onInstall(); }}
              className="px-2 py-1 flex items-center gap-1 text-xs bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded transition-colors"
            >
              <Download size={12} /> Install
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">Agent Profile Name</label>
          <input 
            type="text" 
            value={cli.name}
            onChange={(e) => onUpdate('name', e.target.value)}
            className="w-full bg-[#0a0a0c] border border-[#2d2d35] rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-sky-500 outline-none"
            placeholder="e.g. My Linter"
          />
        </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">Command / Executable</label>
          <input 
            type="text" 
            value={cli.cliCommand}
            onChange={(e) => onUpdate('cliCommand', e.target.value)}
            className="w-full bg-[#0a0a0c] border border-[#2d2d35] rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-sky-500 outline-none font-mono"
            placeholder="e.g. npx"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">Arguments (space separated)</label>
          <input 
            type="text" 
            value={cli.defaultArgs.join(' ')}
            onChange={(e) => onUpdate('defaultArgs', e.target.value.split(' ').filter(Boolean))}
            className="w-full bg-[#0a0a0c] border border-[#2d2d35] rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-sky-500 outline-none font-mono"
            placeholder="e.g. eslint --fix ."
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">Capabilities Routing</label>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {['coding', 'testing', 'review', 'planning'].map(cap => (
            <label key={cap} className="flex items-center gap-1.5 text-zinc-400 cursor-pointer hover:text-zinc-200">
              <input
                type="checkbox"
                checked={(caps as any)[cap]}
                onChange={(e) => onUpdate('capabilities', { ...caps, [cap]: e.target.checked })}
                className="rounded border-zinc-700 bg-transparent text-sky-500 focus:ring-0 focus:ring-offset-0"
              />
              <span className="capitalize">{cap}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">Check Command</label>
          <input 
            type="text" 
            value={cli.checkCmd || ''}
            onChange={(e) => onUpdate('checkCmd', e.target.value)}
            className="w-full bg-[#0a0a0c] border border-[#2d2d35] rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-sky-500 outline-none font-mono"
            placeholder="e.g. npx --version"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">Install Command</label>
          <input 
            type="text" 
            value={cli.installCommand || ''}
            onChange={(e) => onUpdate('installCommand', e.target.value)}
            className="w-full bg-[#0a0a0c] border border-[#2d2d35] rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-sky-500 outline-none font-mono"
            placeholder="e.g. npm install -g eslint"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-mono text-zinc-500 uppercase">Startup Instructions (commands executed sequentially on shell PTY boot, one per line)</label>
        <textarea
          value={(cli.startupInstructions || []).join('\n')}
          onChange={(e) => onUpdate('startupInstructions', e.target.value.split('\n').filter(Boolean))}
          placeholder="e.g. npm install"
          rows={2}
            className="w-full bg-[#0a0a0c] text-xs text-zinc-200 border border-[#2d2d35] px-3 py-1.5 rounded outline-none focus:border-sky-500 font-mono"
          />
        </div>

        {isCustom && onDelete && (
          <div className="flex justify-end pt-2">
            <button 
              onClick={onDelete}
              className="px-3 py-1.5 flex items-center gap-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded transition-colors border border-rose-500/20"
            >
              <Trash2 size={12} /> Delete Agent Profile
            </button>
          </div>
        )}

        </div>
      )}

    </div>
  );
};
