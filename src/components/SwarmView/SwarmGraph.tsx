import React, { useState, useRef, useEffect } from 'react';
import { Bot, Play, Pause, AlertCircle, CheckCircle } from 'lucide-react';
import { ExecutionMetadata, ValidationRunInfo } from '../../types/executionReview';

interface Node {
  id: string;
  label: string;
  role: string;
  x: number;
  y: number;
  description: string;
}

interface SwarmGraphProps {
  metadata: ExecutionMetadata | null;
  validationRun: ValidationRunInfo | null;
}

export const SwarmGraph: React.FC<SwarmGraphProps> = ({ metadata, validationRun }) => {
  const [nodes, setNodes] = useState<Node[]>([
    { id: 'planner', label: 'Planner Agent', role: 'planning', x: 80, y: 110, description: 'Orchestrates architecture plans' },
    { id: 'coder', label: 'Coder Agent', role: 'coding', x: 280, y: 50, description: 'Writes implementation files' },
    { id: 'validator', label: 'Validator Agent', role: 'testing', x: 480, y: 50, description: 'Runs tests and checks syntax' },
    { id: 'reviewer', label: 'Reviewer Agent', role: 'review', x: 680, y: 110, description: 'Performs manual review & approval' }
  ]);

  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate active states
  let activeNodeId = '';
  let failedNodeId = '';
  let successNodeId = '';

  if (metadata) {
    const status = metadata.status;
    
    if (status === 'running') {
      if (validationRun && ['running', 'validating'].includes(validationRun.status)) {
        activeNodeId = 'validator';
      } else {
        activeNodeId = 'coder';
      }
    } else if (status === 'completed' || status === 'passed') {
      if (validationRun && validationRun.status === 'failed') {
        failedNodeId = 'validator';
      } else {
        activeNodeId = 'reviewer'; // Waiting for manual merge approval
      }
    } else if (status === 'failed') {
      failedNodeId = 'coder';
    } else if (status === 'merged') {
      successNodeId = 'reviewer';
    }
  } else {
    activeNodeId = 'planner'; // Idle/Default
  }

  // Handle Drag Start
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!svgRef.current) return;
    
    const node = nodes.find(n => n.id === id);
    if (!node) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setDraggedNode(id);
    setDragOffset({
      x: mouseX - node.x,
      y: mouseY - node.y
    });
  };

  // Handle Dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedNode || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Capping values to prevent dragging off canvas
    const x = Math.max(40, Math.min(rect.width - 120, mouseX - dragOffset.x));
    const y = Math.max(30, Math.min(rect.height - 40, mouseY - dragOffset.y));

    setNodes(prev => prev.map(n => n.id === draggedNode ? { ...n, x, y } : n));
  };

  // Handle Drag End
  const handleMouseUp = () => {
    setDraggedNode(null);
  };

  // Get curved SVG line between nodes
  const getCurvePath = (n1: Node, n2: Node) => {
    const x1 = n1.x + 80; // center offset
    const y1 = n1.y + 25;
    const x2 = n2.x;
    const y2 = n2.y + 25;

    const cx1 = x1 + (x2 - x1) / 2;
    const cy1 = y1;
    const cx2 = x1 + (x2 - x1) / 2;
    const cy2 = y2;
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  };

  return (
    <div className="w-full bg-zinc-950/45 border border-border-glass rounded-xl p-4 mb-6 relative overflow-hidden select-none">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-1.5">
          <Bot size={13} className="text-accent-primary" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Interactive Swarm Graph</span>
        </div>
        <span className="text-[9px] text-zinc-500 font-mono">Drag nodes to reorganize graph</span>
      </div>

      <svg
        ref={svgRef}
        className="w-full h-[180px] bg-transparent overflow-visible cursor-default"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Draw Edges / Connection Lines */}
        <g>
          {/* Main Pipeline Edges */}
          <path
            d={getCurvePath(nodes[0], nodes[1])}
            fill="none"
            stroke={activeNodeId === 'coder' ? 'var(--accent-primary, #fbbf24)' : 'rgba(255, 255, 255, 0.1)'}
            strokeWidth={activeNodeId === 'coder' ? '2.5' : '1.5'}
            className={activeNodeId === 'coder' ? 'animate-[dash_2s_linear_infinite]' : ''}
            strokeDasharray={activeNodeId === 'coder' ? '6,6' : '0'}
          />
          <path
            d={getCurvePath(nodes[1], nodes[2])}
            fill="none"
            stroke={activeNodeId === 'validator' ? 'var(--accent-primary, #fbbf24)' : 'rgba(255, 255, 255, 0.1)'}
            strokeWidth={activeNodeId === 'validator' ? '2.5' : '1.5'}
            className={activeNodeId === 'validator' ? 'animate-[dash_2s_linear_infinite]' : ''}
            strokeDasharray={activeNodeId === 'validator' ? '6,6' : '0'}
          />
          <path
            d={getCurvePath(nodes[2], nodes[3])}
            fill="none"
            stroke={activeNodeId === 'reviewer' ? 'var(--accent-primary, #fbbf24)' : 'rgba(255, 255, 255, 0.1)'}
            strokeWidth={activeNodeId === 'reviewer' ? '2.5' : '1.5'}
            className={activeNodeId === 'reviewer' ? 'animate-[dash_2s_linear_infinite]' : ''}
            strokeDasharray={activeNodeId === 'reviewer' ? '6,6' : '0'}
          />

          {/* Loopback Edges */}
          {failedNodeId === 'validator' && (
            <path
              d={getCurvePath(nodes[2], nodes[1])}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="4,4"
            />
          )}
        </g>

        {/* Draw Nodes */}
        {nodes.map((node) => {
          const isActive = activeNodeId === node.id;
          const isFailed = failedNodeId === node.id;
          const isSuccess = successNodeId === node.id;

          let borderStroke = 'rgba(255, 255, 255, 0.1)';
          let bgFill = 'rgba(20, 20, 25, 0.7)';
          let iconColor = 'text-zinc-400';
          let textColor = 'text-zinc-300';
          let glowClass = '';

          if (isActive) {
            borderStroke = 'var(--accent-primary, #fbbf24)';
            bgFill = 'rgba(251, 191, 36, 0.05)';
            iconColor = 'text-accent-primary';
            textColor = 'text-white';
            glowClass = 'drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]';
          } else if (isFailed) {
            borderStroke = '#ef4444';
            bgFill = 'rgba(239, 68, 68, 0.05)';
            iconColor = 'text-accent-error';
            textColor = 'text-red-400';
            glowClass = 'drop-shadow-[0_0_8px_rgba(239,68,68,0.35)]';
          } else if (isSuccess) {
            borderStroke = '#10b981';
            bgFill = 'rgba(16, 185, 129, 0.05)';
            iconColor = 'text-accent-success';
            textColor = 'text-emerald-400';
            glowClass = 'drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]';
          }

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onMouseDown={(e) => handleMouseDown(e, node.id)}
              className={`cursor-grab active:cursor-grabbing group ${glowClass}`}
            >
              {/* Outer Glow Ring */}
              {isActive && (
                <rect
                  x="-2"
                  y="-2"
                  width="124"
                  height="54"
                  rx="8"
                  fill="none"
                  stroke="var(--accent-primary, #fbbf24)"
                  strokeWidth="1.5"
                  className="animate-ping opacity-30"
                  style={{ animationDuration: '3s' }}
                />
              )}

              {/* Node Card background */}
              <rect
                x="0"
                y="0"
                width="120"
                height="50"
                rx="6"
                fill={bgFill}
                stroke={borderStroke}
                strokeWidth={isActive ? '2' : '1'}
                className="transition-all duration-300 backdrop-blur-md"
              />

              {/* Title text */}
              <text
                x="14"
                y="20"
                className={`text-[9px] font-bold font-sans tracking-wide fill-current ${textColor}`}
              >
                {node.label}
              </text>

              {/* Description text */}
              <text
                x="14"
                y="36"
                className="text-[7.5px] font-sans fill-zinc-500 font-medium"
              >
                {node.role.toUpperCase()}
              </text>

              {/* Status Indicator Badge */}
              <g transform="translate(100, 15)">
                {isActive && (
                  <circle cx="0" cy="0" r="3.5" fill="var(--accent-primary, #fbbf24)" className="animate-pulse" />
                )}
                {isFailed && (
                  <circle cx="0" cy="0" r="3.5" fill="#ef4444" />
                )}
                {isSuccess && (
                  <circle cx="0" cy="0" r="3.5" fill="#10b981" />
                )}
              </g>
            </g>
          );
        })}
      </svg>

      {/* Edge Dash Keyframe Animation */}
      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -40;
          }
        }
      `}</style>
    </div>
  );
};
