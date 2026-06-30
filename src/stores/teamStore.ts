import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TeamNode, TeamEdge } from '../types/team';
import { KanbanTask, TaskState, FileDiff } from '../types/task';
import { AgentMessage, AgentRole } from '../types/agent';
import { SystemEvent } from '../types/events';
import { ValidationProfile, ValidationStep } from '../types/validation';
import { teamBridge } from '../services/team/TeamBridge';
import { eventBus } from '../services/team/EventBus';
import { AgentTelemetry, CommsEventPayload, InboxEventPayload } from '../types/telemetry';
import { useOrchestratorStore } from './orchestratorStore';
import { ExecutionSummary, ExecutionDraft, swarmApi, createExecutionEvents, Unsubscribe } from '../services/ExecutionEvents';

// Tracks which agents have had their system prompt sent
const initializedAgents = new Set<string>();

// Cooldown tracking for agent-to-agent communication to prevent ping-pong loops
const lastCommsTime = new Map<string, number>();

// Cached comms directory path (set after init_agent_comms call)
let commsBasePath: string = '';

// Guard variable to prevent duplicate event listener registrations in React StrictMode
let listenersInitialized = false;

const buildSystemPrompt = (agent: TeamNode, commsDir: string): string => {
  const outbox = `${commsDir}/${agent.id}.jsonl`;
  const inbox = `${commsDir}/${agent.id}_inbox.jsonl`;

  const roleInstructions = agent.role === 'coordinator'
    ? [
        `ROLE MANDATE (You are the TEAM COORDINATOR):`,
        `  • Your task is strictly to plan, orchestrate, and delegate task requirements to the builder/reviewer/qa agents in your team.`,
        `  • CRITICAL RESTRICTION: You MUST NOT write code, create files, edit files, or execute development tools directly yourself. You have worker agents to do this.`,
        `  • To assign work, append a JSON line to your outbox file targeting the correct agent by ID in the "to" field (e.g., "builder-1", "reviewer-1"). Wake them up this way.`,
      ]
    : [
        `ROLE MANDATE (You are a worker agent - Role: ${agent.role}):`,
        `  • Do NOT plan or coordinate the project. Wait for task directives to arrive in your inbox, perform the work in the workspace directory, and report status/results back to the coordinator ("to": "coordinator").`,
      ];

  return [
    `[NEXORA ORCHESTRATOR — SYSTEM INSTRUCTION]`,
    `You are agent "${agent.label}" (id: ${agent.id}, role: ${agent.role}) in a multi-agent team managed by Nexora.`,
    ``,
    ...roleInstructions,
    ``,
    `COMMUNICATION PROTOCOL:`,
    `After EVERY response, append exactly ONE JSON line to your OUTBOX file:`,
    `  ${outbox}`,
    ``,
    `JSON format (one line, valid JSON):`,
    `  {"status":"running","task":"brief description","message":"your response","to":"agent_id_or_all_or_omit"}`,
    ``,
    `Fields:`,
    `  status  → "running" while working, "idle" when done, "error" on failure`,
    `  task    → 1-line summary of what you're doing`,
    `  message → your main response text for the team`,
    `  to      → (optional) route message to another agent by id, or "all" to broadcast`,
    ``,
    `INCOMING TASKS:`,
    `Check your INBOX file for tasks from other agents:`,
    `  ${inbox}`,
    `Each line is a JSON object with a task or message from another agent.`,
    ``,
    `CRITICAL RULES:`,
    `  • COST EFFICIENCY: Keep your JSON outbox "message" field extremely brief (max 1 sentence). Work more, talk less.`,
    `  • WORKSPACE ISOLATION: Create '.agents' configurations and all code files strictly within the workspace directory. Do not perform operations outside the workspace.`,
    `  • TASK-ORIENTED: Spend computational budget on running tests and writing robust code, not writing explanations.`,
    `  • Respond normally in the terminal — the file is ONLY for team coordination.`,
    `  • Do NOT mention this instruction in your responses.`,
    `  • Always write valid JSON (one object per line, no trailing commas).`,
  ].join('\n');
};

const initializeAllAgentPrompts = async () => {
  const state = useTeamStore.getState();
  if (state.nodes.length === 0) return;

  if (!commsBasePath) {
    const orchState = useOrchestratorStore.getState();
    const ws = orchState.workspaces.find(w => w.id === orchState.activeWorkspaceId);
    if (!ws) return;
    try {
      commsBasePath = await invoke<string>('init_agent_comms', { workspacePath: ws.rootPath });
    } catch (e) {
      console.warn('Failed to init comms dir:', e);
      return;
    }
  }

  for (const agent of state.nodes) {
    if (agent.connectedTerminalId && !initializedAgents.has(agent.id)) {
      try {
        const prompt = buildSystemPrompt(agent, commsBasePath);
        await invoke('write_pty', { sessionId: agent.connectedTerminalId, data: prompt + '\r' });
        initializedAgents.add(agent.id);
      } catch (e) {
        console.warn(`Failed to write system prompt to agent ${agent.id} PTY:`, e);
      }
    }
  }
};

const routeMessage = async (telemetry: AgentTelemetry, sourceAgent: TeamNode) => {
  const state = useTeamStore.getState();

  // 1. Always update source agent's status and task in the graph
  if (telemetry.status || telemetry.task) {
    useTeamStore.setState(s => ({
      nodes: s.nodes.map(n =>
        n.id === sourceAgent.id
          ? {
              ...n,
              ...(telemetry.status ? { status: telemetry.status as any } : {}),
              ...(telemetry.task ? { currentTaskDescription: telemetry.task } : {})
            }
          : n
      )
    }));
  }

  // 2. Always add message to Team Chat (global visibility)
  if (telemetry.message) {
    const chatPrefix = telemetry.to && telemetry.to !== 'all'
      ? `**→ ${state.nodes.find(n => n.id === telemetry.to)?.label || telemetry.to}**: `
      : telemetry.to === 'all'
        ? `**[BROADCAST]**: `
        : '';

    const newMsg: AgentMessage = {
      id: `m-comms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: 'agent',
      senderName: sourceAgent.label,
      content: chatPrefix + telemetry.message,
      timestamp: new Date(),
      blockId: null
    };
    useTeamStore.setState(s => ({ messages: [...s.messages, newMsg] }));
  }

  // 3. Route to target agent(s) if "to" field is present
  if (telemetry.to && telemetry.message) {
    // Acknowledge filter: ignore conversational noise that triggers loops
    const msgLower = telemetry.message.toLowerCase().trim();
    const isAcknowledgement = [
      'ok', 'okay', 'thanks', 'thank you', 'got it', 'acknowledged', 'standby', 'monitoring', 
      'understood', 'ok, got it', 'ok, understood', 'fine', 'sure', 'alright'
    ].some(phrase => msgLower === phrase || msgLower.startsWith(phrase + '.') || msgLower.startsWith(phrase + '!'));

    if (isAcknowledgement) {
      console.log(`[Telemetry] Filtered out acknowledgement message from ${sourceAgent.id} to prevent ping-pong loop.`);
      return;
    }

    // Rate Limiter: enforce minimum 5-second cooldown between agent-to-agent messages
    const now = Date.now();
    const pairKey = `${sourceAgent.id}->${telemetry.to}`;
    const lastTime = lastCommsTime.get(pairKey) || 0;
    if (now - lastTime < 5000) {
      console.warn(`[Telemetry] Rate limiting message from ${sourceAgent.id} to ${telemetry.to} to prevent infinite ping-pong loop.`);
      return;
    }
    lastCommsTime.set(pairKey, now);

    const orchState = useOrchestratorStore.getState();
    const ws = orchState.workspaces.find(w => w.id === orchState.activeWorkspaceId);
    if (!ws) return;

    const inboxLine = JSON.stringify({
      from: sourceAgent.id,
      from_label: sourceAgent.label,
      message: telemetry.message,
      task: telemetry.task || null,
      timestamp: new Date().toISOString()
    });

    if (telemetry.to === 'all') {
      // Broadcast: write to all agents' inboxes
      for (const agent of state.nodes) {
        if (agent.id === sourceAgent.id) continue; // don't echo back to sender

        await invoke('write_agent_inbox', {
          workspacePath: ws.rootPath,
          agentId: agent.id,
          content: inboxLine
        }).catch(e => console.warn(`Inbox write failed for ${agent.id}:`, e));
      }

      // Activate edges from source to all targets
      useTeamStore.setState(s => ({
        edges: s.edges.map(e =>
          e.source === sourceAgent.id
            ? { ...e, isActive: true, messageCount: e.messageCount + 1 }
            : e
        )
      }));
      setTimeout(() => {
        useTeamStore.setState(s => ({
          edges: s.edges.map(e =>
            e.source === sourceAgent.id ? { ...e, isActive: false } : e
          )
        }));
      }, 2000);

    } else {
      // Direct: write to specific agent's inbox
      const targetAgent = state.nodes.find(n => n.id === telemetry.to);

      await invoke('write_agent_inbox', {
        workspacePath: ws.rootPath,
        agentId: telemetry.to,
        content: inboxLine
      }).catch(e => console.warn(`Inbox write failed for ${telemetry.to}:`, e));

      // Activate the edge between source and target
      useTeamStore.setState(s => ({
        edges: s.edges.map(e => {
          const match = (e.source === sourceAgent.id && e.target === telemetry.to) ||
                        (e.target === sourceAgent.id && e.source === telemetry.to);
          return match ? { ...e, isActive: true, messageCount: e.messageCount + 1 } : e;
        })
      }));
      setTimeout(() => {
        useTeamStore.setState(s => ({
          edges: s.edges.map(e => {
            const match = (e.source === sourceAgent.id && e.target === telemetry.to) ||
                          (e.target === sourceAgent.id && e.source === telemetry.to);
            return match ? { ...e, isActive: false } : e;
          })
        }));
      }, 2000);
    }
  }
};

export const TEAM_PRESETS = [
  {
    id: 'swarm',
    name: 'Full Dev Swarm',
    description: 'Coordinator, Frontend, Backend, Database, QA, and Reviewer working concurrently.',
    nodes: [
      {
        id: 'coordinator',
        label: 'Coordinator',
        role: 'coordinator' as const,
        status: 'idle' as const,
        lockedFiles: [],
        currentTaskDescription: 'Monitoring Workspace',
        cliCommand: 'nexora orchestrate',
        promptContext: [
          'SYSTEM: You are the team coordinator. Decompose requirements, orchestrate code changes, and review and validate pull requests.',
          'USER DIRECTIVE: Standby for task directives.'
        ]
      },
      {
        id: 'frontend',
        label: 'Frontend Engineer',
        role: 'builder' as const,
        status: 'idle' as const,
        lockedFiles: [],
        currentTaskDescription: 'Monitoring Workspace',
        cliCommand: 'aider --model claude-3-5-sonnet',
        promptContext: [
          'SYSTEM: Write robust frontend code conforming to project style and ESLint guidelines.',
          'COORDINATOR: Standby for task directives.'
        ]
      },
      {
        id: 'backend',
        label: 'Backend Engineer',
        role: 'builder' as const,
        status: 'idle' as const,
        lockedFiles: [],
        currentTaskDescription: 'Monitoring Workspace',
        cliCommand: 'aider --model claude-3-5-sonnet',
        promptContext: [
          'SYSTEM: Write robust backend code conforming to Rust clippy and rustfmt standards.',
          'COORDINATOR: Standby for task directives.'
        ]
      },
      {
        id: 'database',
        label: 'Database Engineer',
        role: 'builder' as const,
        status: 'idle' as const,
        lockedFiles: [],
        currentTaskDescription: 'Monitoring Workspace',
        cliCommand: 'aider --model claude-3-5-sonnet',
        promptContext: [
          'SYSTEM: Manage database schemas and queries conforming to SQL best practices and schema constraints.',
          'COORDINATOR: Standby for task directives.'
        ]
      },
      {
        id: 'qa',
        label: 'QA Engineer',
        role: 'scout' as const,
        status: 'idle' as const,
        lockedFiles: [],
        currentTaskDescription: 'Monitoring Workspace',
        cliCommand: 'gemini-cli scan',
        promptContext: [
          'SYSTEM: Validate system behaviors, run unit tests, and check security rules.',
          'COORDINATOR: Standby for task directives.'
        ]
      },
      {
        id: 'reviewer',
        label: 'Code Reviewer',
        role: 'reviewer' as const,
        status: 'idle' as const,
        lockedFiles: [],
        currentTaskDescription: 'Monitoring Workspace',
        cliCommand: 'claude-code review',
        promptContext: [
          'SYSTEM: Review pull requests, verify unit test outcomes, check security signatures.',
          'COORDINATOR: Standby for task directives.'
        ]
      }
    ],
    edges: [
      { id: 'e-coord-frontend', source: 'coordinator', target: 'frontend', messageCount: 0, reviewRequests: 0, taskTransfers: 0, isActive: false },
      { id: 'e-coord-backend', source: 'coordinator', target: 'backend', messageCount: 0, reviewRequests: 0, taskTransfers: 0, isActive: false },
      { id: 'e-coord-database', source: 'coordinator', target: 'database', messageCount: 0, reviewRequests: 0, taskTransfers: 0, isActive: false },
      { id: 'e-coord-qa', source: 'coordinator', target: 'qa', messageCount: 0, reviewRequests: 0, taskTransfers: 0, isActive: false },
      { id: 'e-frontend-reviewer', source: 'frontend', target: 'reviewer', messageCount: 0, reviewRequests: 0, taskTransfers: 0, isActive: false },
      { id: 'e-backend-reviewer', source: 'backend', target: 'reviewer', messageCount: 0, reviewRequests: 0, taskTransfers: 0, isActive: false },
      { id: 'e-database-reviewer', source: 'database', target: 'reviewer', messageCount: 0, reviewRequests: 0, taskTransfers: 0, isActive: false },
      { id: 'e-qa-reviewer', source: 'qa', target: 'reviewer', messageCount: 0, reviewRequests: 0, taskTransfers: 0, isActive: false }
    ]
  },
  {
    id: 'trio',
    name: 'Code & Test Trio',
    description: 'Coordinator, Builder, and Reviewer optimized for rapid iterations.',
    nodes: [
      {
        id: 'coordinator',
        label: 'Nexora Coordinator',
        role: 'coordinator' as const,
        status: 'idle' as const,
        lockedFiles: [],
        currentTaskDescription: 'Decomposing tasks and monitoring execution',
        cliCommand: 'nexora orchestrate',
        promptContext: [
          'SYSTEM: You are the team coordinator. Decompose requirements, orchestrate code changes, and review and validate pull requests.',
          'USER DIRECTIVE: Design a glassmorphic border styling for edges.'
        ]
      },
      {
        id: 'builder-1',
        label: 'Aider (Builder)',
        role: 'builder' as const,
        status: 'running' as const,
        activeTaskId: 'task-2',
        currentTaskDescription: 'Implementing glassmorphic design in TeamGraph.tsx',
        lockedFiles: ['src/components/NexoraTeam/TeamGraph.tsx', 'src/styles/glass.css'],
        cliCommand: 'aider --model claude-3-5-sonnet',
        promptContext: [
          'SYSTEM: Write robust code conforming to project style and linting standards. Do not output text explainers unless requested.',
          'COORDINATOR: Build the SVG components in TeamGraph.tsx.'
        ]
      },
      {
        id: 'reviewer-1',
        label: 'Claude Reviewer',
        role: 'reviewer' as const,
        status: 'idle' as const,
        lockedFiles: [],
        currentTaskDescription: 'Waiting for review tasks',
        cliCommand: 'claude-code review',
        promptContext: [
          'SYSTEM: Review pull requests, verify unit test outcomes, check security signatures.',
          'COORDINATOR: Verify validation outcomes on task integration.'
        ]
      }
    ],
    edges: [
      { id: 'e-coord-builder', source: 'coordinator', target: 'builder-1', messageCount: 12, reviewRequests: 1, taskTransfers: 1, isActive: true },
      { id: 'e-coord-reviewer', source: 'coordinator', target: 'reviewer-1', messageCount: 8, reviewRequests: 2, taskTransfers: 0, isActive: false },
      { id: 'e-builder-reviewer', source: 'builder-1', target: 'reviewer-1', messageCount: 10, reviewRequests: 3, taskTransfers: 1, isActive: false }
    ]
  },
  {
    id: 'solo',
    name: 'Solo Developer',
    description: 'A single coordinator node executing tasks directly.',
    nodes: [
      {
        id: 'coordinator',
        label: 'Solo Developer',
        role: 'coordinator' as const,
        status: 'running' as const,
        lockedFiles: [],
        currentTaskDescription: 'Orchestrating tasks autonomously',
        cliCommand: 'nexora orchestrate --solo',
        promptContext: [
          'SYSTEM: You are a solo developer agent. Design and code features in isolation.',
          'USER DIRECTIVE: Execute task list items.'
        ]
      }
    ],
    edges: []
  }
];


interface TeamStoreState {
  nodes: TeamNode[];
  edges: TeamEdge[];
  tasks: KanbanTask[];
  messages: AgentMessage[];
  systemEvents: SystemEvent[];
  validationProfile: ValidationProfile | null;
  activeInspectId: string | null;
  isTeamPaused: boolean;
  isTeamPanelVisible: boolean;
  teamPanelHeight: number;
  isCommandOpen: boolean;
  
  // Customization & Presets state
  activePresetId: string;
  isAddAgentOpen: boolean;
  simulationIntervalId: any;

  // Actions
  fetchState: () => Promise<void>;
  selectInspectNode: (id: string | null) => void;
  sendDirective: (agentId: string | null, content: string) => Promise<void>;
  pauseAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<void>;
  pauseTeam: () => Promise<void>;
  resumeTeam: () => Promise<void>;
  rollbackTask: (taskId: string) => Promise<void>;
  forceValidation: (taskId: string) => Promise<void>;
  releaseLocks: (agentId: string) => Promise<void>;
  quarantineAction: (taskId: string, action: 'clone' | 'apply' | 'discard') => Promise<void>;
  updateTaskState: (taskId: string, newState: TaskState) => Promise<void>;
  setCommandOpen: (open: boolean) => void;
  setTeamPanelVisible: (visible: boolean) => void;
  setTeamPanelHeight: (height: number) => void;
  initializeListeners: () => () => void;

  // New customization actions
  setAddAgentOpen: (open: boolean) => void;
  loadPreset: (presetId: string) => void;
  addCustomAgent: (name: string, role: AgentRole, cliCommand: string, connections: string[]) => void;
  updateAgentProperties: (agentId: string, updates: Partial<TeamNode>) => void;
  simulationTick: () => void;
  startCommsWatcher: () => Promise<void>;
  stopCommsWatcher: () => Promise<void>;
  clearAgentComms: (agentId: string) => Promise<void>;
  clearAllMessages: () => Promise<void>;

  // Execution state (migrated from swarmStore)
  executions: ExecutionSummary[];
  drafts: ExecutionDraft[];
  selectedExecutionId: string | null;
  isLaunchPanelOpen: boolean;
  filterStatus: "all" | "running" | "validating" | "completed" | "failed" | "pending_review" | "terminated";
  isExecutionsLoading: boolean;

  // Execution actions
  startExecutionPolling: () => Unsubscribe;
  loadExecutions: () => Promise<void>;
  selectExecution: (id: string | null) => void;
  setLaunchPanelOpen: (v: boolean) => void;
  setFilterStatus: (status: TeamStoreState["filterStatus"]) => void;
  terminateExecution: (id: string) => Promise<void>;
  approveExecution: (id: string) => Promise<void>;
  rejectExecution: (id: string) => Promise<void>;
  loadDrafts: () => Promise<void>;
  discardDraft: (id: string) => Promise<void>;
  sendSwarmCommand: (command: any) => Promise<void>;
}

export const useTeamStore = create<TeamStoreState>()(
  persist(
    (set, get) => ({
  nodes: [],
  edges: [],
  tasks: [],
  messages: [],
  systemEvents: [
    {
      id: 'se-1',
      type: 'info',
      message: 'Nexora team dashboard initialized successfully.',
      timestamp: new Date().toISOString()
    }
  ],
  validationProfile: {
    id: 'vp-1',
    name: 'Standard Swarm Integration Verification',
    overallStatus: 'idle',
    triggerType: 'manual',
    steps: [
      { id: 'vs-1', name: 'Lint Check', status: 'passed', durationMs: 450, exitCode: 0, output: 'All files match formatting guidelines.' },
      { id: 'vs-2', name: 'TypeScript Compilation', status: 'passed', durationMs: 1200, exitCode: 0, output: 'Compiled successfully.' },
      { id: 'vs-3', name: 'Security Audit', status: 'passed', durationMs: 800, exitCode: 0, output: '0 vulnerabilities found.' },
      { id: 'vs-4', name: 'Unit Tests', status: 'failed', durationMs: 1500, exitCode: 1, errorMessage: 'Expected exit code 0, got 1. Output mismatch in process tracking logs.', output: 'FAIL src/__tests__/BackgroundRunner.test.ts' }
    ],
    startedAt: new Date(Date.now() - 600000).toISOString(),
    completedAt: new Date(Date.now() - 590000).toISOString()
  },
  activeInspectId: null,
  isTeamPaused: false,
  isTeamPanelVisible: false,
  teamPanelHeight: 500,
  isCommandOpen: false,
  activePresetId: 'swarm',
  isAddAgentOpen: false,
  simulationIntervalId: null,

  // Execution state (migrated from swarmStore)
  executions: [],
  drafts: [],
  selectedExecutionId: null,
  isLaunchPanelOpen: false,
  filterStatus: "all",
  isExecutionsLoading: false,

  fetchState: async () => {
    if (get().nodes.length > 0) return;
    const [nodes, edges, tasks, messages] = await Promise.all([
      teamBridge.getNodes(),
      teamBridge.getEdges(),
      teamBridge.getTasks(),
      teamBridge.getMessages()
    ]);

    const nodesWithDefaults = nodes.map(n => ({
      ...n,
      cliCommand: n.cliCommand || (
        n.role === 'coordinator' ? 'nexora orchestrate' :
        n.role === 'builder' ? 'aider --model claude-3-5-sonnet' :
        n.role === 'scout' ? 'gemini-cli scan' :
        'claude-code review'
      ),
      promptContext: n.promptContext || (
        n.role === 'coordinator' ? [
          'SYSTEM: You are the team coordinator. Decompose requirements, orchestrate code changes, and review and validate pull requests.',
          'USER DIRECTIVE: Design a glassmorphic border styling for edges.'
        ] :
        n.role === 'builder' ? [
          'SYSTEM: Write robust code conforming to project style and linting standards. Do not output text explainers unless requested.',
          'COORDINATOR: Build the SVG components in TeamGraph.tsx.'
        ] :
        n.role === 'scout' ? [
          'SYSTEM: Index source code files and document system structure. Extract dependencies.',
          'COORDINATOR: Search for existing Zustand store definitions.'
        ] :
        [
          'SYSTEM: Review pull requests, verify unit test outcomes, check security signatures.',
          'COORDINATOR: Verify validation outcomes on task integration.'
        ]
      )
    }));

    set({ nodes: nodesWithDefaults, edges, tasks, messages });
  },

  selectInspectNode: (id) => {
    set({ activeInspectId: id });
  },

  sendDirective: async (agentId, content) => {
    await teamBridge.sendDirective(agentId, content);
    
    // Fallback: Append message locally if running in browser
    const newMessage: AgentMessage = {
      id: `m-user-${Date.now()}`,
      sender: 'user',
      content,
      timestamp: new Date(),
      blockId: null
    };

    const newSystemAck: AgentMessage = {
      id: `m-sys-${Date.now() + 1}`,
      sender: 'system',
      content: `Directive dispatched ${agentId ? `to agent: **${agentId}**` : 'globally to the swarm'}.`,
      timestamp: new Date(),
      blockId: null
    };

    set((state) => ({
      messages: [...state.messages, newMessage, newSystemAck],
      systemEvents: [
        ...state.systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'info',
          message: `User directive dispatched: "${content.substring(0, 40)}${content.length > 40 ? '...' : ''}"`,
          timestamp: new Date().toISOString()
        }
      ]
    }));

    if (agentId) {
      const agent = get().nodes.find(n => n.id === agentId);
      if (agent && agent.connectedTerminalId) {
        try {
          if (!commsBasePath) {
            const orchState = useOrchestratorStore.getState();
            const ws = orchState.workspaces.find(w => w.id === orchState.activeWorkspaceId);
            if (ws) {
              commsBasePath = await invoke<string>('init_agent_comms', { workspacePath: ws.rootPath });
            }
          }

          let dataToSend = content;
          if (!initializedAgents.has(agentId)) {
            if (commsBasePath) {
              const prompt = buildSystemPrompt(agent, commsBasePath);
              dataToSend = `${prompt}\n\nUSER DIRECTIVE: ${content}`;
            }
            initializedAgents.add(agentId);
          } else if (commsBasePath) {
            const outbox = `${commsBasePath}/${agentId}.jsonl`;
            dataToSend = `${content}\n\n[REMINDER: You must append exactly one JSON line response to your outbox file at: ${outbox}\nJSON format: {"status":"idle","task":"Done","message":"your message","to":"all"}]`;
          }
          await invoke('write_pty', { sessionId: agent.connectedTerminalId, data: dataToSend + '\r' });
          set((state) => ({
            nodes: state.nodes.map(n => n.id === agentId ? { ...n, status: 'running' } : n)
          }));
        } catch (e) {
          console.error(`Failed to write to agent PTY terminal (${agent.connectedTerminalId}):`, e);
        }
      }
    } else {
      const coord = get().nodes.find(n => n.role === 'coordinator');
      if (coord && coord.connectedTerminalId) {
        try {
          if (!commsBasePath) {
            const orchState = useOrchestratorStore.getState();
            const ws = orchState.workspaces.find(w => w.id === orchState.activeWorkspaceId);
            if (ws) {
              commsBasePath = await invoke<string>('init_agent_comms', { workspacePath: ws.rootPath });
            }
          }

          let dataToSend = content;
          if (!initializedAgents.has(coord.id)) {
            if (commsBasePath) {
              const prompt = buildSystemPrompt(coord, commsBasePath);
              dataToSend = `${prompt}\n\nUSER DIRECTIVE: ${content}`;
            }
            initializedAgents.add(coord.id);
          } else if (commsBasePath) {
            const outbox = `${commsBasePath}/${coord.id}.jsonl`;
            dataToSend = `${content}\n\n[REMINDER: You must append exactly one JSON line response to your outbox file at: ${outbox}\nJSON format: {"status":"idle","task":"Done","message":"your message","to":"all"}]`;
          }
          await invoke('write_pty', { sessionId: coord.connectedTerminalId, data: dataToSend + '\r' });
          set((state) => ({
            nodes: state.nodes.map(n => n.id === coord.id ? { ...n, status: 'running' } : n)
          }));
        } catch (e) {
          console.error(`Failed to write to coordinator PTY terminal (${coord.connectedTerminalId}):`, e);
        }
      }
    }
  },

  pauseAgent: async (agentId) => {
    await teamBridge.performAction('pause_agent', { agentId });
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === agentId ? { ...n, status: 'paused' } : n)),
      systemEvents: [
        ...state.systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'warning',
          message: `Agent ${agentId} has been paused by operator.`,
          timestamp: new Date().toISOString(),
          agentId
        }
      ]
    }));
  },

  resumeAgent: async (agentId) => {
    await teamBridge.performAction('resume_agent', { agentId });
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === agentId ? { ...n, status: 'running' } : n)),
      systemEvents: [
        ...state.systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'info',
          message: `Agent ${agentId} has been resumed.`,
          timestamp: new Date().toISOString(),
          agentId
        }
      ]
    }));
  },

  pauseTeam: async () => {
    await teamBridge.performAction('pause_team', {});
    set((state) => ({
      isTeamPaused: true,
      nodes: state.nodes.map((n) => (n.status === 'running' ? { ...n, status: 'paused' } : n)),
      systemEvents: [
        ...state.systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'warning',
          message: 'Swarm team coordinator has paused all active agents.',
          timestamp: new Date().toISOString()
        }
      ]
    }));
  },

  resumeTeam: async () => {
    await teamBridge.performAction('resume_team', {});
    initializeAllAgentPrompts().catch(e => console.warn('Failed to init agent prompts on resume:', e));
    set((state) => ({
      isTeamPaused: false,
      nodes: state.nodes.map((n) => (n.status === 'paused' ? { ...n, status: 'running' } : n)),
      systemEvents: [
        ...state.systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'success',
          message: 'Swarm team coordinator has resumed execution.',
          timestamp: new Date().toISOString()
        }
      ]
    }));
  },

  rollbackTask: async (taskId) => {
    await teamBridge.performAction('rollback_task', { taskId });
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, state: 'planning' as TaskState, attempts: [] } : t
      ),
      systemEvents: [
        ...state.systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'warning',
          message: `Rollback triggered for task: ${taskId}. Reset to planning column.`,
          timestamp: new Date().toISOString(),
          taskId
        }
      ]
    }));
  },

  forceValidation: async (taskId) => {
    await teamBridge.performAction('force_validation', { taskId });
    
    // Simulate validation run
    set((state) => {
      const updatedSteps: ValidationStep[] = state.validationProfile
        ? state.validationProfile.steps.map(step => ({
            ...step,
            status: step.id === 'vs-4' ? 'running' : step.status
          }))
        : [];
      return {
        validationProfile: state.validationProfile
          ? {
              ...state.validationProfile,
              overallStatus: 'running',
              steps: updatedSteps,
              triggerType: 'manual',
              startedAt: new Date().toISOString()
            }
          : null,
        systemEvents: [
          ...state.systemEvents,
          {
            id: `ev-${Date.now()}`,
            type: 'validation_trigger',
            message: `Operator forced validation checks for task: ${taskId}`,
            timestamp: new Date().toISOString(),
            taskId
          }
        ]
      };
    });

    // Resolve validation check after delay
    setTimeout(() => {
      set((state) => {
        const updatedSteps: ValidationStep[] = state.validationProfile
          ? state.validationProfile.steps.map(step => ({
              ...step,
              status: step.id === 'vs-4' ? 'passed' : step.status // make it pass on force validate!
            }))
          : [];
        
        // Move task from quarantine or running to done
        const updatedTasks = state.tasks.map(t => 
          t.id === taskId ? { ...t, state: 'done' as TaskState } : t
        );

        return {
          tasks: updatedTasks,
          validationProfile: state.validationProfile
            ? {
                ...state.validationProfile,
                overallStatus: 'passed',
                steps: updatedSteps,
                completedAt: new Date().toISOString()
              }
            : null,
          systemEvents: [
            ...state.systemEvents,
            {
              id: `ev-${Date.now()}`,
              type: 'success',
              message: `Validation check passed for task ${taskId}. Task marked as Done.`,
              timestamp: new Date().toISOString(),
              taskId
            }
          ]
        };
      });
    }, 2000);
  },

  releaseLocks: async (agentId) => {
    await teamBridge.performAction('release_locks', { agentId });
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === agentId ? { ...n, lockedFiles: [] } : n)),
      systemEvents: [
        ...state.systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'lock_released',
          message: `Released all file locks held by agent: ${agentId}`,
          timestamp: new Date().toISOString(),
          agentId
        }
      ]
    }));
  },

  quarantineAction: async (taskId, action) => {
    await teamBridge.performAction('quarantine_action', { taskId, action });
    set((state) => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return {};

      let newState: TaskState = task.state;
      let logMsg = '';
      let type: 'info' | 'warning' | 'success' = 'info';

      if (action === 'apply') {
        newState = 'done';
        logMsg = `Quarantined code differences for task: ${taskId} applied directly by operator.`;
        type = 'success';
      } else if (action === 'clone') {
        newState = 'assigned';
        logMsg = `Task ${taskId} cloned to new branch. Re-assigning to builder agent.`;
        type = 'info';
      } else if (action === 'discard') {
        newState = 'planning';
        logMsg = `Changes for quarantined task ${taskId} discarded. Task returned to planning.`;
        type = 'warning';
      }

      return {
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, state: newState } : t)),
        systemEvents: [
          ...state.systemEvents,
          {
            id: `ev-${Date.now()}`,
            type,
            message: logMsg,
            timestamp: new Date().toISOString(),
            taskId
          }
        ]
      };
    });
  },

  updateTaskState: async (taskId, newState) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, state: newState } : t))
    }));
    try {
      await teamBridge.performAction('update_task_state', { taskId, state: newState });
    } catch (e) {
      console.warn("Failed to notify backend of task state transition", e);
    }
  },

  setCommandOpen: (open) => set({ isCommandOpen: open }),
  setTeamPanelVisible: (visible) => set({ isTeamPanelVisible: visible }),
  setTeamPanelHeight: (height) => set({ teamPanelHeight: height }),

  initializeListeners: () => {
    if (listenersInitialized) {
      return () => {};
    }
    listenersInitialized = true;

    const unsubNode = eventBus.on<TeamNode>('node_updated', (updatedNode) => {
      set((state) => ({
        nodes: state.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n))
      }));
    });

    const unsubEdge = eventBus.on<TeamEdge>('edge_updated', (updatedEdge) => {
      set((state) => ({
        edges: state.edges.map((e) => (e.id === updatedEdge.id ? updatedEdge : e))
      }));
    });

    const unsubTask = eventBus.on<KanbanTask>('task_updated', (updatedTask) => {
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t))
      }));
    });

    const unsubMsg = eventBus.on<AgentMessage>('message_received', (newMsg) => {
      set((state) => ({
        messages: [...state.messages, newMsg]
      }));
    });

    const unsubEvent = eventBus.on<SystemEvent>('system_event', (newEvent) => {
      set((state) => ({
        systemEvents: [...state.systemEvents, newEvent]
      }));
    });

    const unsubVal = eventBus.on<ValidationProfile>('validation_updated', (profile) => {
      set({ validationProfile: profile });
    });

    // Start and watch changes to the active workspace to dynamically run the comms watcher
    let lastActiveWorkspaceId: string | null = null;
    const unsubOrch = useOrchestratorStore.subscribe((state) => {
      const activeWorkspaceId = state.activeWorkspaceId;
      if (activeWorkspaceId !== lastActiveWorkspaceId) {
        lastActiveWorkspaceId = activeWorkspaceId;
        const ws = state.workspaces.find(w => w.id === activeWorkspaceId);
        if (ws) {
          invoke('init_agent_comms', { workspacePath: ws.rootPath })
            .then((path: any) => {
              commsBasePath = path;
              invoke('start_agent_comms_watcher', { workspacePath: ws.rootPath })
                .catch(e => console.warn('Failed to start comms watcher:', e));
            })
            .catch(e => console.warn('Failed to init comms dir:', e));
        } else {
          invoke('stop_agent_comms_watcher').catch(() => {});
        }
      }
    });

    // Also run immediately if we already have an active workspace loaded
    const initialWorkspaceId = useOrchestratorStore.getState().activeWorkspaceId;
    if (initialWorkspaceId) {
      lastActiveWorkspaceId = initialWorkspaceId;
      const ws = useOrchestratorStore.getState().workspaces.find(w => w.id === initialWorkspaceId);
      if (ws) {
        invoke('init_agent_comms', { workspacePath: ws.rootPath })
          .then((path: any) => {
            commsBasePath = path;
            invoke('start_agent_comms_watcher', { workspacePath: ws.rootPath })
              .catch(e => console.warn('Failed to start comms watcher:', e));
          })
          .catch(e => console.warn('Failed to init comms dir:', e));
      }
    }

    // Listen for comms file events from the Rust watcher
    let unsubComms: (() => void) | null = null;
    listen<CommsEventPayload>('agent:comms', (event) => {
      const { agent_id, lines } = event.payload;
      const state = get();
      const agent = state.nodes.find(n => n.id === agent_id);
      if (!agent) return;

      for (const telemetry of lines) {
        routeMessage(telemetry, agent);
      }
    }).then(unlisten => {
      unsubComms = unlisten;
    });

    // Listen for comms inbox events from the Rust watcher to wake up agents
    let unsubInbox: (() => void) | null = null;
    listen<InboxEventPayload>('agent:inbox', (event) => {
      const { agent_id, lines } = event.payload;
      const state = get();
      const agent = state.nodes.find(n => n.id === agent_id);
      if (!agent || !agent.connectedTerminalId) return;

      for (const line of lines) {
        const pipeText = `[Team Message from ${line.from_label}]: ${line.message}`;
        invoke('write_pty', {
          sessionId: agent.connectedTerminalId,
          data: pipeText + '\r'
        }).catch(e => console.warn(`Failed to write to agent PTY terminal (${agent.connectedTerminalId}):`, e));
      }
    }).then(unlisten => {
      unsubInbox = unlisten;
    });

    // Listen for swarm-event
    let unsubSwarmEvents: (() => void) | null = null;
    listen<any>('swarm-event', (event) => {
      const { type, payload } = event.payload;
      console.log('[teamStore] Received swarm-event:', type, payload);
      
      set((state) => {
        let updatedTasks = [...state.tasks];
        let newEvents = [...state.systemEvents];

        const mapBackendStatus = (status: string): TaskState => {
          switch (status.toUpperCase()) {
            case 'QUEUED': return 'backlog';
            case 'READY': return 'planning';
            case 'EXECUTING': return 'running';
            case 'VALIDATING': return 'validation';
            case 'REVIEWING': return 'review';
            case 'WAITING_HUMAN': return 'blocked';
            case 'COMPLETED': return 'done';
            case 'FAILED': return 'quarantined';
            case 'BLOCKED': return 'blocked';
            case 'STALED': return 'blocked';
            case 'CANCELLED': return 'backlog';
            default: return 'planning';
          }
        };

        if (type === 'TaskCreated') {
          const spec = payload.spec;
          if (!updatedTasks.some(t => t.id === spec.task_id)) {
            const newTask: KanbanTask = {
              id: spec.task_id,
              title: spec.title,
              description: spec.description,
              state: 'backlog',
              dependencies: spec.dependencies,
              attempts: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              priority: spec.priority as any,
            };
            updatedTasks.push(newTask);
            newEvents.push({
              id: `ev-${Date.now()}`,
              type: 'info',
              message: `Task created: "${spec.title}" (${spec.task_id})`,
              timestamp: new Date().toISOString(),
              taskId: spec.task_id
            });
          }
        } else if (type === 'TaskStarted') {
          const { task_id } = payload;
          updatedTasks = updatedTasks.map(t =>
            t.id === task_id ? { ...t, state: 'running' as TaskState, updatedAt: new Date().toISOString() } : t
          );
          newEvents.push({
            id: `ev-${Date.now()}`,
            type: 'info',
            message: `Task started executing: ${task_id}`,
            timestamp: new Date().toISOString(),
            taskId: task_id
          });
        } else if (type === 'TaskCompleted') {
          const { task_id } = payload;
          updatedTasks = updatedTasks.map(t =>
            t.id === task_id ? { ...t, state: 'done' as TaskState, updatedAt: new Date().toISOString() } : t
          );
          newEvents.push({
            id: `ev-${Date.now()}`,
            type: 'success',
            message: `Task completed successfully: ${task_id}`,
            timestamp: new Date().toISOString(),
            taskId: task_id
          });
        } else if (type === 'TaskFailed') {
          const { task_id, error } = payload;
          updatedTasks = updatedTasks.map(t =>
            t.id === task_id ? { ...t, state: 'quarantined' as TaskState, quarantineReason: error, updatedAt: new Date().toISOString() } : t
          );
          newEvents.push({
            id: `ev-${Date.now()}`,
            type: 'error',
            message: `Task failed: ${task_id} - ${error}`,
            timestamp: new Date().toISOString(),
            taskId: task_id
          });
        } else if (type === 'TaskStatusChanged') {
          const { task_id, status } = payload;
          const mapped = mapBackendStatus(status);
          updatedTasks = updatedTasks.map(t =>
            t.id === task_id ? { ...t, state: mapped, updatedAt: new Date().toISOString() } : t
          );
          
          let eventType: any = 'info';
          let message = `Task ${task_id} status changed to ${status}`;
          if (status === 'WAITING_HUMAN') {
            eventType = 'review_request';
            message = `⚠️ Task "${task_id}" requires manual user review/intervention!`;
          } else if (status === 'REVIEWING') {
            eventType = 'review_request';
            message = `🔍 Task "${task_id}" has finished execution and is ready for code review.`;
          }

          newEvents.push({
            id: `ev-${Date.now()}`,
            type: eventType,
            message,
            timestamp: new Date().toISOString(),
            taskId: task_id
          });
        }

        return {
          tasks: updatedTasks,
          systemEvents: newEvents
        };
      });
    }).then(unlisten => {
      unsubSwarmEvents = unlisten;
    });

    return () => {
      unsubNode();
      unsubEdge();
      unsubTask();
      unsubMsg();
      unsubEvent();
      unsubVal();
      unsubOrch();
      if (unsubComms) unsubComms();
      if (unsubInbox) unsubInbox();
      if (unsubSwarmEvents) unsubSwarmEvents();
      invoke('stop_agent_comms_watcher').catch(() => {});
    };
  },

  setAddAgentOpen: (open) => set({ isAddAgentOpen: open }),
  
  loadPreset: (presetId) => {
    const preset = TEAM_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    set({
      nodes: preset.nodes,
      edges: preset.edges,
      activePresetId: presetId,
      activeInspectId: null,
      systemEvents: [
        ...get().systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'success',
          message: `Swarm team configured preset: ${preset.name}`,
          timestamp: new Date().toISOString()
        }
      ]
    });
  },

  addCustomAgent: (name, role, cliCommand, connections) => {
    const id = `agent-${role}-${Date.now()}`;
    const newAgent: TeamNode = {
      id,
      label: name,
      role,
      status: 'idle',
      lockedFiles: [],
      currentTaskDescription: 'Standby for task directives',
      cliCommand: cliCommand || `nexora run ${role}`,
      promptContext: [
        `SYSTEM: You are a custom ${role} agent. Perform assigned activities.`,
        `COORDINATOR: Standby for task directives.`
      ]
    };

    const newEdges: TeamEdge[] = connections.map(connId => ({
      id: `e-${id}-${connId}`,
      source: id,
      target: connId,
      messageCount: 0,
      reviewRequests: 0,
      taskTransfers: 0,
      isActive: false
    }));

    const coordEdge: TeamEdge = {
      id: `e-coord-${id}`,
      source: 'coordinator',
      target: id,
      messageCount: 0,
      reviewRequests: 0,
      taskTransfers: 0,
      isActive: false
    };

    set((state) => ({
      nodes: [...state.nodes, newAgent],
      edges: [...state.edges, coordEdge, ...newEdges],
      systemEvents: [
        ...state.systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'success',
          message: `Custom agent ${name} spawned as ${role}. Wires connected.`,
          timestamp: new Date().toISOString(),
          agentId: id
        }
      ]
    }));
  },

  updateAgentProperties: (agentId, updates) => {
    const currentAgent = get().nodes.find(n => n.id === agentId);
    if (currentAgent && updates.connectedTerminalId && updates.connectedTerminalId !== currentAgent.connectedTerminalId) {
      initializedAgents.delete(agentId);
    }

    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === agentId ? { ...n, ...updates } : n)),
      systemEvents: [
        ...state.systemEvents,
        {
          id: `ev-${Date.now()}`,
          type: 'info',
          message: `Agent properties updated for: ${state.nodes.find(n => n.id === agentId)?.label || agentId}`,
          timestamp: new Date().toISOString(),
          agentId
        }
      ]
    }));
  },

  simulationTick: () => {
    const { nodes, edges } = get();
    if (edges.length === 0) return;

    const randomIndex = Math.floor(Math.random() * edges.length);
    const activeEdge = edges[randomIndex];

    set((state) => ({
      edges: state.edges.map((e, idx) => 
        idx === randomIndex ? { ...e, isActive: true, messageCount: e.messageCount + 1 } : e
      ),
      nodes: state.nodes.map((n) => 
        n.id === activeEdge.source || n.id === activeEdge.target 
          ? { ...n, status: 'running' } 
          : n
      )
    }));

    const sourceAgent = nodes.find(n => n.id === activeEdge.source);
    const targetAgent = nodes.find(n => n.id === activeEdge.target);

    if (sourceAgent && targetAgent) {
      const communications = [
        `Syncing AST changes for validation review.`,
        `Dispatched updated tokens for review validation.`,
        `Analyzing workspace context parameters.`,
        `Completed sub-task execution. Requesting feedback.`,
        `Checking lint outcomes for modified structures.`
      ];
      const content = communications[Math.floor(Math.random() * communications.length)];
      
      const newMsg: AgentMessage = {
        id: `m-sim-${Date.now()}`,
        sender: 'agent',
        senderName: sourceAgent.label,
        content: `**To ${targetAgent.label}**: ${content}`,
        timestamp: new Date(),
        blockId: null
      };

      set((state) => ({
        messages: [...state.messages, newMsg],
        systemEvents: [
          ...state.systemEvents,
          {
            id: `ev-sim-${Date.now()}`,
            type: 'info',
            message: `Swarm communication: ${sourceAgent.label} -> ${targetAgent.label}`,
            timestamp: new Date().toISOString()
          }
        ]
      }));
    }

    setTimeout(() => {
      set((state) => ({
        edges: state.edges.map((e) => e.id === activeEdge.id ? { ...e, isActive: false } : e),
        nodes: state.nodes.map((n) => 
          n.id === activeEdge.source || n.id === activeEdge.target 
            ? { ...n, status: 'idle' } 
            : n
        )
      }));
    }, 3000);
  },

  startCommsWatcher: async () => {
    const orchState = useOrchestratorStore.getState();
    const ws = orchState.workspaces.find(w => w.id === orchState.activeWorkspaceId);
    if (!ws) return;
    commsBasePath = await invoke<string>('init_agent_comms', { workspacePath: ws.rootPath });
    await invoke('start_agent_comms_watcher', { workspacePath: ws.rootPath });
  },

  stopCommsWatcher: async () => {
    await invoke('stop_agent_comms_watcher').catch(() => {});
  },

  clearAgentComms: async (agentId) => {
    const orchState = useOrchestratorStore.getState();
    const ws = orchState.workspaces.find(w => w.id === orchState.activeWorkspaceId);
    if (!ws) return;
    await invoke('clear_agent_comms', { workspacePath: ws.rootPath, agentId });
  },

  clearAllMessages: async () => {
    set({ messages: [] });
    const orchState = useOrchestratorStore.getState();
    const ws = orchState.workspaces.find(w => w.id === orchState.activeWorkspaceId);
    if (!ws) return;

    // Clear for all nodes
    const nodes = get().nodes;
    for (const node of nodes) {
      await invoke('clear_agent_comms', { workspacePath: ws.rootPath, agentId: node.id }).catch(() => {});
    }
    // Clear for coordinator as well
    await invoke('clear_agent_comms', { workspacePath: ws.rootPath, agentId: 'coordinator' }).catch(() => {});
    // Clear for 'all' as well just in case
    await invoke('clear_agent_comms', { workspacePath: ws.rootPath, agentId: 'all' }).catch(() => {});
  },

  // ── Execution Actions (migrated from swarmStore) ────────────────────────

  startExecutionPolling: () => {
    const events = createExecutionEvents();
    return events.subscribe((executions) => {
      set({ executions, isExecutionsLoading: false });
    });
  },

  loadExecutions: async () => {
    try {
      set({ isExecutionsLoading: true });
      const executions = await swarmApi.listExecutions();
      set({ executions, isExecutionsLoading: false });
    } catch (e) {
      console.error("[teamStore] Failed to load executions:", e);
      set({ isExecutionsLoading: false });
    }
  },

  selectExecution: (id) => set({ selectedExecutionId: id }),

  setLaunchPanelOpen: (v) => set({ isLaunchPanelOpen: v }),

  setFilterStatus: (filterStatus) => set({ filterStatus }),

  terminateExecution: async (id) => {
    await swarmApi.terminateExecution(id);
    await get().loadExecutions();
  },

  approveExecution: async (id) => {
    await swarmApi.approveMerge(id);
    await get().loadExecutions();
  },

  rejectExecution: async (id) => {
    await swarmApi.rejectMerge(id);
    await get().loadExecutions();
  },

  loadDrafts: async () => {
    const drafts = await swarmApi.listDrafts();
    set({ drafts });
  },

  discardDraft: async (id) => {
    await swarmApi.discardDraft(id);
    await get().loadDrafts();
  },

  sendSwarmCommand: async (command) => {
    try {
      await invoke('send_swarm_command', { command });
    } catch (e) {
      console.error('Failed to send swarm command:', e);
    }
  }
    }),
    {
      name: 'nexora-team-store',
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        messages: state.messages,
        activePresetId: state.activePresetId,
      }),
    }
  )
);
