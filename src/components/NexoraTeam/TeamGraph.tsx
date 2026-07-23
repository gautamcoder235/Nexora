import React, { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  BaseEdge,
  getBezierPath,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTeamStore } from '../../stores/teamStore';
import { TeamNode as StoreTeamNode, TeamEdge as StoreTeamEdge } from '../../types/team';
import { Zap, MessageSquare, ClipboardCheck, ArrowRightLeft, FileCode, Maximize2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Custom Node Component to display agent state, avatar, role, progress ring, etc.
const AgentNode: React.FC<NodeProps> = ({ data }) => {
  const node = data.node as StoreTeamNode;
  const isInspected = data.isInspected as boolean;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#22C55E';
      case 'paused': return '#F59E0B';
      case 'error': return '#EF4444';
      case 'idle': return '#71717A';
      default: return '#7C5CFF';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'running': return 'rgba(34, 197, 94, 0.08)';
      case 'paused': return 'rgba(245, 158, 11, 0.08)';
      case 'error': return 'rgba(239, 68, 68, 0.08)';
      case 'idle': return 'rgba(113, 113, 122, 0.08)';
      default: return 'rgba(124, 92, 255, 0.08)';
    }
  };

  const statusColor = getStatusColor(node.status);
  const statusBg = getStatusBg(node.status);
  const progress = 75; // Let's use a default progress for workers
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative">
      {/* Handles for connections */}
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-[#1B1B22] !border-[#1B1B22] hover:!bg-[#7C5CFF]" style={{ left: -4 }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-[#1B1B22] !border-[#1B1B22] hover:!bg-[#7C5CFF]" style={{ right: -4 }} />

      {/* Main Node Card */}
      <div 
        className={`flex items-center gap-3 p-3 w-56 rounded-xl border bg-[#121218]/90 backdrop-blur-xl shadow-xl transition-all duration-300 ${
          isInspected 
            ? 'border-[#7C5CFF] shadow-[0_0_20px_rgba(124,92,255,0.25)] scale-[1.02]' 
            : 'border-[#1B1B22] hover:border-zinc-500'
        }`}
        style={{
          boxShadow: isInspected 
            ? `0 0 20px rgba(124, 92, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)` 
            : `inset 0 1px 0 rgba(255, 255, 255, 0.03)`
        }}
      >
        {/* Left Side: Avatar with dynamic progress ring */}
        <div className="relative flex-shrink-0 w-11 h-11 flex items-center justify-center">
          {/* Progress Ring */}
          <svg className="absolute w-full h-full transform -rotate-90">
            <circle cx="22" cy="22" r={radius} stroke="#1B1B22" strokeWidth="2" fill="transparent" />
            <circle 
              cx="22" cy="22" r={radius} 
              stroke={statusColor} strokeWidth="2" fill="transparent" 
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>

          {/* Initials Avatar */}
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold tracking-wider text-white"
            style={{ backgroundColor: statusBg, border: `1px solid ${statusColor}40` }}
          >
            {node.label.substring(0, 2).toUpperCase()}
          </div>

          {/* Tiny Status Indicator Badge */}
          <span 
            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-[#121218]"
            style={{ backgroundColor: statusColor }}
          />
        </div>

        {/* Right Side: Labels and Details */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 w-full">
            <span className="text-xs font-semibold text-zinc-100 truncate">{node.label}</span>
          </div>
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
            {node.id === 'qa' || node.label.toLowerCase().includes('qa') || node.label.toLowerCase().includes('validation')
              ? 'VALIDATION'
              : node.role === 'coordinator'
              ? 'COORDINATOR'
              : node.role === 'reviewer'
              ? 'REVIEWER'
              : 'AGENT'}
          </span>
          
          {node.lockedFiles && node.lockedFiles.length > 0 ? (
            <div className="flex items-center gap-1 mt-1 text-[9px] text-[#F59E0B] font-mono">
              <FileCode className="w-2.5 h-2.5" />
              <span>{node.lockedFiles.length} file lock</span>
            </div>
          ) : (
            <span className="text-[9px] text-zinc-600 mt-1 capitalize truncate">
              {node.currentTaskDescription || 'Monitoring workspace'}
            </span>
          )}
        </div>

        {/* Pulsing indicator if working */}
        {node.status === 'running' && (
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
        )}
      </div>
    </div>
  );
};

// Custom Edge Component to support hover state & statistic popup cards
const CustomFlowEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });

  const edge = data?.edge as StoreTeamEdge;
  const [isHovered, setIsHovered] = useState(false);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (rect) {
      setHoverPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <>
      {/* Invisible thicker path to make hovering easier */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        className="cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setIsHovered(false)}
      />

      {/* Visually rendered edge connection */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: edge?.isActive ? '#7C5CFF' : '#1B1B22',
          strokeWidth: edge?.isActive ? 2 : 1,
          opacity: edge?.isActive ? 1 : 0.4,
          transition: 'stroke 0.3s, stroke-width 0.3s',
          ...style,
        }}
      />

      {/* Animated flow particle if edge is active */}
      {edge?.isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke="url(#edge-flow-gradient)"
          strokeWidth={3}
          strokeDasharray="6 30"
          className="animate-[dash_3s_linear_infinite]"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Statistics Hover Card Overlay */}
      {isHovered && edge && (
        <foreignObject
          x={hoverPos.x + 10}
          y={hoverPos.y + 10}
          width={180}
          height={120}
          className="z-50"
        >
          <div className="p-3.5 rounded-xl border border-[#1B1B22] bg-[#121218]/95 backdrop-blur-md shadow-2xl text-[10px] text-zinc-300 font-sans select-none pointer-events-none">
            <div className="font-semibold text-zinc-200 border-b border-[#1B1B22] pb-1.5 mb-2 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3 h-3 text-[#7C5CFF]" />
              <span>Link Telemetry</span>
            </div>
            <div className="space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">Messages:</span>
                <span className="text-zinc-200">{edge.messageCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Reviews:</span>
                <span className="text-zinc-200">{edge.reviewRequests}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Transfers:</span>
                <span className="text-zinc-200">{edge.taskTransfers}</span>
              </div>
            </div>
          </div>
        </foreignObject>
      )}
    </>
  );
};

const ReactFlowGraph: React.FC = () => {
  const { nodes: storeNodes, edges: storeEdges, activeInspectId, selectInspectNode } = useTeamStore();
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Node placement resolver with safe non-overlapping vertical spacing
  const getNodePosition = (role: string, index: number, total: number) => {
    if (role === 'coordinator') {
      return { x: 50, y: 160 };
    }
    if (role === 'reviewer') {
      return { x: 640, y: 160 };
    }
    
    // Workers vertical distribution with 120px step to prevent card overlap
    const step = 120;
    const midY = 160;
    const startY = midY - ((total - 1) * step) / 2;
    return {
      x: 340,
      y: Math.max(40, startY + index * step),
    };
  };

  useEffect(() => {
    const workers = storeNodes.filter(n => n.role !== 'coordinator' && n.role !== 'reviewer');
    const totalWorkers = workers.length || 1;

    setNodes((prevNodes) => {
      const prevMap = new Map(prevNodes.map(pn => [pn.id, pn.position]));

      return storeNodes.map((n) => {
        let position = prevMap.get(n.id);
        if (!position) {
          if (n.role === 'coordinator' || n.role === 'reviewer') {
            position = getNodePosition(n.role, 0, 1);
          } else {
            const workerIndex = workers.findIndex(w => w.id === n.id);
            position = getNodePosition(n.role, workerIndex, totalWorkers);
          }
        }

        return {
          id: n.id,
          type: 'agentNode',
          position,
          data: {
            node: n,
            isInspected: activeInspectId === n.id,
          },
        };
      });
    });

    const flowEdges: Edge[] = storeEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'customEdge',
      data: { edge: e },
      animated: e.isActive,
    }));

    setEdges(flowEdges);
  }, [storeNodes, storeEdges, activeInspectId, setNodes, setEdges]);

  const onNodeClick = (_: any, node: Node) => {
    selectInspectNode(node.id);
  };

  const autoAlignGraph = () => {
    const workers = storeNodes.filter(n => n.role !== 'coordinator' && n.role !== 'reviewer');
    const totalWorkers = workers.length || 1;

    const alignedNodes: Node[] = storeNodes.map((n) => {
      let position = { x: 0, y: 0 };
      if (n.role === 'coordinator' || n.role === 'reviewer') {
        position = getNodePosition(n.role, 0, 1);
      } else {
        const workerIndex = workers.findIndex(w => w.id === n.id);
        position = getNodePosition(n.role, workerIndex, totalWorkers);
      }

      return {
        id: n.id,
        type: 'agentNode',
        position,
        data: {
          node: n,
          isInspected: activeInspectId === n.id,
        },
      };
    });

    setNodes(alignedNodes);
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
  };

  // Auto-center the nodes in the viewport whenever nodes count changes
  useEffect(() => {
    if (nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.15, duration: 250 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, fitView]);

  const nodeTypes = useMemo(() => ({ agentNode: AgentNode }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomFlowEdge }), []);

  return (
    <div className="relative w-full h-full bg-[#0D0D10] border border-[#1B1B22] rounded-xl overflow-hidden shadow-lg">
      <Background color="#1B1B22" gap={16} size={1} />
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        className="font-sans"
        minZoom={0.5}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <svg className="absolute w-0 h-0">
          <defs>
            <linearGradient id="edge-flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7C5CFF" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#7C5CFF" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#7C5CFF" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>
      </ReactFlow>

      {/* Floating utility controls */}
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        <button
          onClick={autoAlignGraph}
          className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-[#121218] border border-[#1B1B22] text-xs font-mono text-zinc-400 hover:text-white hover:border-zinc-700 transition-all shadow-md active:scale-95"
          title="Auto align nodes into clean hierarchical columns"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span>Auto Align</span>
        </button>
        <button
          onClick={() => fitView({ padding: 0.2, duration: 250 })}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#121218] border border-[#1B1B22] text-zinc-400 hover:text-white transition-colors"
          title="Fit view"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const TeamGraph: React.FC = () => {
  return (
    <ReactFlowProvider>
      <ReactFlowGraph />
    </ReactFlowProvider>
  );
};
