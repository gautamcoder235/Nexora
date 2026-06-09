import React, { useState, useEffect } from "react";
import { BookOpen, Save, FileEdit, Eye } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { invoke } from "@tauri-apps/api/core";

import { EventBus } from "../core/events";

interface ProjectMemoryProps {
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  isMemorySaving: boolean;
  setIsMemorySaving: (saving: boolean) => void;
  memorySaveStatus: "idle" | "success" | "error";
  setMemorySaveStatus: (status: "idle" | "success" | "error") => void;
  setMemorySaveError: (error: string) => void;
}

export const ProjectMemory: React.FC<ProjectMemoryProps> = ({
  selectedProjectId,
  setSelectedProjectId,
  isMemorySaving,
  setIsMemorySaving,
  memorySaveStatus,
  setMemorySaveStatus,
  setMemorySaveError
}) => {
  const { projects, activeWorkspaceId, initializeProjectMemory } = useOrchestratorStore();
  const activeProjects = projects.filter(p => p.workspaceId === activeWorkspaceId);
  
  const files = [
    { id: "architecture.md", label: "architecture.md", desc: "System topology & stack" },
    { id: "decisions.md", label: "decisions.md", desc: "Architecture decisions log" },
    { id: "findings.md", label: "findings.md", desc: "Investigations & workarounds" },
    { id: "tasks.md", label: "tasks.md", desc: "Checklist of project task items" }
  ];
  
  const [selectedFile, setSelectedFile] = useState<string>("architecture.md");
  const [fileContent, setFileContent] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  const project = activeProjects.find(p => p.id === selectedProjectId);

  // Load file content when project or file changes
  useEffect(() => {
    let isSubscribed = true;
    const loadFile = async () => {
      if (!project || !selectedFile) {
        setFileContent("");
        return;
      }
      try {
        const path = `${project.path.replace(/\\/g, "/")}/${selectedFile}`;
        const content = await invoke<string>("read_project_file", { path });
        if (isSubscribed) {
          setFileContent(content);
          setMemorySaveStatus("idle");
        }
      } catch (err) {
        if (isSubscribed) {
          setFileContent(`Failed to load ${selectedFile}. File may not exist yet or is empty.`);
          setMemorySaveStatus("idle");
        }
      }
    };

    loadFile();
    return () => {
      isSubscribed = false;
    };
  }, [selectedProjectId, selectedFile]);

  const handleSaveFile = async () => {
    if (!project || !selectedFile) return;
    setIsMemorySaving(true);
    setMemorySaveStatus("idle");
    try {
      const path = `${project.path.replace(/\\/g, "/")}/${selectedFile}`;
      await invoke("write_project_file", { path, content: fileContent });
      setMemorySaveStatus("success");
      
      // If tasks.md was updated, reload tasks checklist in store
      if (selectedFile === "tasks.md") {
        await initializeProjectMemory(project.id);
      }
    } catch (err: any) {
      console.error(err);
      setMemorySaveStatus("error");
      setMemorySaveError(err.toString());
    } finally {
      setIsMemorySaving(false);
      setTimeout(() => {
        setMemorySaveStatus("idle");
      }, 3000);
    }
  };

  useEffect(() => {
    const handleTriggerSave = () => {
      handleSaveFile();
    };
    const unsub = EventBus.subscribe("project-memory:save", handleTriggerSave);
    return unsub;
  }, [selectedProjectId, selectedFile, fileContent, project]);

  // Basic markdown to HTML renderer for preview mode
  const renderSimpleMarkdown = (text: string) => {
    if (!text) return <p className="text-zinc-600 italic">Empty file.</p>;
    
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      // Headers
      if (trimmed.startsWith("# ")) {
        return <h1 key={idx} className="text-lg font-bold text-zinc-100 border-b border-zinc-800 pb-1 mt-3 mb-2 font-sans">{trimmed.substring(2)}</h1>;
      }
      if (trimmed.startsWith("## ")) {
        return <h2 key={idx} className="text-sm font-bold text-zinc-200 mt-3 mb-1.5 font-sans">{trimmed.substring(3)}</h2>;
      }
      if (trimmed.startsWith("### ")) {
        return <h3 key={idx} className="text-xs font-bold text-zinc-300 mt-2 mb-1 font-sans">{trimmed.substring(4)}</h3>;
      }
      
      // Bullets and tasks
      if (trimmed.startsWith("- [ ]") || trimmed.startsWith("- [/]") || trimmed.startsWith("- [x]")) {
        const isDone = trimmed.startsWith("- [x]");
        const isDoing = trimmed.startsWith("- [/]");
        const textContent = trimmed.substring(5).trim();
        return (
          <div key={idx} className="flex items-center gap-2 text-xs py-0.5 text-zinc-300">
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] font-bold ${
              isDone ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" :
              isDoing ? "bg-accent-primary/20 border-accent-primary/50 text-accent-primary animate-pulse" :
              "border-zinc-700 bg-transparent text-transparent"
            }`}>
              {isDone ? "✓" : isDoing ? "..." : ""}
            </span>
            <span className={isDone ? "line-through text-zinc-500" : ""}>{textContent}</span>
          </div>
        );
      }
      if (trimmed.startsWith("- ")) {
        return (
          <li key={idx} className="text-xs text-zinc-300 ml-4 list-disc py-0.5">
            {trimmed.substring(2)}
          </li>
        );
      }

      // Empty line
      if (trimmed === "") {
        return <div key={idx} className="h-2" />;
      }

      // Blockquote / context warning boxes
      if (trimmed.startsWith("> ")) {
        return (
          <div key={idx} className="border-l-2 border-zinc-700 bg-zinc-850/20 px-2.5 py-1 text-[10px] my-1 text-zinc-400 rounded-r">
            {trimmed.substring(2)}
          </div>
        );
      }

      // Normal paragraph
      return <p key={idx} className="text-xs text-zinc-400 leading-relaxed py-0.5 break-words">{line}</p>;
    });
  };

  if (!activeWorkspaceId) return null;

  return (
    <div className="flex flex-col h-full space-y-2 font-mono overflow-hidden">

      {/* Main layout splits: File List vs Editor */}
      <div className="flex-grow flex overflow-hidden min-h-0 gap-1.5">
        {/* Memory File Selectors */}
        <div className="w-40 flex-shrink-0 flex flex-col gap-1 overflow-y-auto pr-1">
          {files.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFile(f.id)}
              className={`w-full text-left p-2 border rounded-md transition-all flex flex-col cursor-pointer ${
                selectedFile === f.id
                  ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
                  : "bg-[#0c0c0e]/50 border-border-glass text-zinc-400 hover:bg-[#121214]/65 hover:border-border-glass-hover"
              }`}
            >
              <span className="text-[11px] font-bold font-mono">{f.label}</span>
              <span className="text-[9px] text-zinc-500 font-mono mt-0.5 leading-normal">{f.desc}</span>
            </button>
          ))}
          {project && (
            <div className="mt-3 bg-[#09090b]/80 border border-border-glass rounded-md p-2.5 text-[9px] text-zinc-500 leading-normal font-sans">
              <span className="font-bold text-zinc-400 uppercase font-mono block mb-1">Location:</span>
              <code className="break-all font-mono text-[9px] text-zinc-350">{project.path}/{selectedFile}</code>
            </div>
          )}
        </div>

        {/* Editor or Preview split */}
        <div className="flex-1 flex flex-col border border-border-glass rounded-md bg-[#09090b] overflow-hidden">
          {/* Editor Tabs Header */}
          <div className="bg-[#050507] border-b border-border-glass px-1.5 py-0.5 flex items-center justify-between flex-shrink-0 select-none">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab("edit")}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-all cursor-pointer ${
                  activeTab === "edit"
                    ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                    : "text-zinc-500 hover:text-zinc-350"
                }`}
              >
                <FileEdit size={10} />
                Write Markdown
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded transition-all cursor-pointer ${
                  activeTab === "preview"
                    ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                    : "text-zinc-500 hover:text-zinc-350"
                }`}
              >
                <Eye size={10} />
                Preview Mode
              </button>
            </div>
            
            <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wide">
              Markdown Editor
            </span>
          </div>

          {/* Editor Container */}
          <div className="flex-1 overflow-hidden min-h-0 relative">
            {activeTab === "edit" ? (
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                placeholder={`Write markdown documentation for ${selectedFile} here...`}
                className="w-full h-full p-3 bg-transparent text-zinc-300 text-xs font-mono outline-none border-none resize-none select-text leading-relaxed"
              />
            ) : (
              <div className="w-full h-full overflow-y-auto p-3 bg-transparent space-y-1 font-mono">
                {renderSimpleMarkdown(fileContent)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
