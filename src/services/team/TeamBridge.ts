import { invoke } from '@tauri-apps/api/core';
import { TeamNode, TeamEdge } from '../../types/team';
import { KanbanTask } from '../../types/task';
import { AgentMessage } from '../../types/agent';

// Rich mock data for browser fallback
const mockNodes: TeamNode[] = [
  {
    id: 'coordinator',
    label: 'Coordinator',
    role: 'coordinator',
    status: 'idle',
    lockedFiles: [],
    currentTaskDescription: 'Monitoring Workspace'
  },
  {
    id: 'frontend',
    label: 'Frontend Engineer',
    role: 'builder',
    status: 'idle',
    lockedFiles: [],
    currentTaskDescription: 'Monitoring Workspace'
  },
  {
    id: 'backend',
    label: 'Backend Engineer',
    role: 'builder',
    status: 'idle',
    lockedFiles: [],
    currentTaskDescription: 'Monitoring Workspace'
  },
  {
    id: 'database',
    label: 'Database Engineer',
    role: 'builder',
    status: 'idle',
    lockedFiles: [],
    currentTaskDescription: 'Monitoring Workspace'
  },
  {
    id: 'qa',
    label: 'QA Engineer',
    role: 'scout',
    status: 'idle',
    lockedFiles: [],
    currentTaskDescription: 'Monitoring Workspace'
  },
  {
    id: 'reviewer',
    label: 'Code Reviewer',
    role: 'reviewer',
    status: 'idle',
    lockedFiles: [],
    currentTaskDescription: 'Monitoring Workspace'
  }
];

const mockEdges: TeamEdge[] = [
  {
    id: 'e-coord-frontend',
    source: 'coordinator',
    target: 'frontend',
    messageCount: 0,
    reviewRequests: 0,
    taskTransfers: 0,
    isActive: false
  },
  {
    id: 'e-coord-backend',
    source: 'coordinator',
    target: 'backend',
    messageCount: 0,
    reviewRequests: 0,
    taskTransfers: 0,
    isActive: false
  },
  {
    id: 'e-coord-database',
    source: 'coordinator',
    target: 'database',
    messageCount: 0,
    reviewRequests: 0,
    taskTransfers: 0,
    isActive: false
  },
  {
    id: 'e-coord-qa',
    source: 'coordinator',
    target: 'qa',
    messageCount: 0,
    reviewRequests: 0,
    taskTransfers: 0,
    isActive: false
  },
  {
    id: 'e-frontend-reviewer',
    source: 'frontend',
    target: 'reviewer',
    messageCount: 0,
    reviewRequests: 0,
    taskTransfers: 0,
    isActive: false
  },
  {
    id: 'e-backend-reviewer',
    source: 'backend',
    target: 'reviewer',
    messageCount: 0,
    reviewRequests: 0,
    taskTransfers: 0,
    isActive: false
  },
  {
    id: 'e-database-reviewer',
    source: 'database',
    target: 'reviewer',
    messageCount: 0,
    reviewRequests: 0,
    taskTransfers: 0,
    isActive: false
  },
  {
    id: 'e-qa-reviewer',
    source: 'qa',
    target: 'reviewer',
    messageCount: 0,
    reviewRequests: 0,
    taskTransfers: 0,
    isActive: false
  }
];

const mockTasks: KanbanTask[] = [
  {
    id: 'task-1',
    title: 'Custom CLI configuration panel',
    description: 'Allow configuring arguments and environments for newly added CLI agents in the registry.',
    state: 'backlog',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 20).toISOString(),
    priority: 'low',
    attempts: [],
    dependencies: []
  },
  {
    id: 'task-2',
    title: 'Glassmorphic design in TeamGraph.tsx',
    description: 'Apply glassmorphic borders and status-based HSL glows to agent nodes in the visual team graph.',
    state: 'running',
    assignedAgentId: 'builder-1',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    priority: 'high',
    dependencies: [],
    attempts: [
      {
        attemptNumber: 1,
        startedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
        status: 'failed',
        logOutput: 'Failed to compile: Variable --accent-primary-glow is not defined in glass.css',
        validationErrors: ['CSS validation failed: Missing variable definition']
      },
      {
        attemptNumber: 2,
        startedAt: new Date(Date.now() - 1800000).toISOString(),
        status: 'success',
        logOutput: 'Compilation successful. SVG canvas elements rendered successfully.'
      }
    ]
  },
  {
    id: 'task-3',
    title: 'Define event subscription protocols',
    description: 'Draft the Tauri Event payload schemas for state updates and streaming terminal logs.',
    state: 'planning',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 10).toISOString(),
    priority: 'medium',
    attempts: [],
    dependencies: []
  },
  {
    id: 'task-4',
    title: 'Verify lint rules and compile parameters',
    description: 'Ensure compiler settings in tsconfig.json are strict enough to catch type collisions early.',
    state: 'review',
    assignedAgentId: 'reviewer-1',
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    priority: 'critical',
    dependencies: ['task-2'],
    attempts: [
      {
        attemptNumber: 1,
        startedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        status: 'success',
        logOutput: 'Linter returned 0 errors across 42 typescript files.'
      }
    ]
  },
  {
    id: 'task-5',
    title: 'Implement background execution service',
    description: 'Run commands as detached processes to keep workspace alive even during UI refresh.',
    state: 'quarantined',
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    priority: 'high',
    quarantineReason: 'Validation failed with exit code 1. Output mismatch in process tracking logs.',
    dependencies: [],
    fileDiffs: [
      {
        filePath: 'src/services/BackgroundRunner.ts',
        originalContent: `export function startProcess(cmd: string) {
  // Directly execute blocking process
  const child = execSync(cmd);
  return child.toString();
}`,
        newContent: `import { spawn } from 'child_process';
export function startProcess(cmd: string) {
  // Spawn detached process to prevent locking UI thread
  const child = spawn(cmd, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return child.pid;
}`
      }
    ],
    attempts: [
      {
        attemptNumber: 1,
        startedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        status: 'failed',
        logOutput: 'Error: Cannot run block command inside main process event loop',
        validationErrors: ['Thread lock detected on port 3000']
      }
    ]
  },
  {
    id: 'task-6',
    title: 'Setup Tauri workspace directories',
    description: 'Scaffold standard folder layout for agent configurations and temporary build caches.',
    state: 'done',
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 36).toISOString(),
    priority: 'medium',
    dependencies: [],
    attempts: [
      {
        attemptNumber: 1,
        startedAt: new Date(Date.now() - 3600000 * 47).toISOString(),
        status: 'success',
        logOutput: 'Folders created successfully: .nexora/, .nexora/cache/'
      }
    ]
  }
];

const mockMessages: AgentMessage[] = [];

export const teamBridge = {
  async getNodes(): Promise<TeamNode[]> {
    try {
      return await invoke<TeamNode[]>('get_team_nodes');
    } catch (e) {
      console.debug('Tauri invoke "get_team_nodes" failed. Using mock data.', e);
      return mockNodes;
    }
  },

  async getEdges(): Promise<TeamEdge[]> {
    try {
      return await invoke<TeamEdge[]>('get_team_edges');
    } catch (e) {
      console.debug('Tauri invoke "get_team_edges" failed. Using mock data.', e);
      return mockEdges;
    }
  },

  async getTasks(): Promise<KanbanTask[]> {
    try {
      return await invoke<KanbanTask[]>('get_team_tasks');
    } catch (e) {
      console.debug('Tauri invoke "get_team_tasks" failed. Using mock data.', e);
      return mockTasks;
    }
  },

  async getMessages(): Promise<AgentMessage[]> {
    try {
      return await invoke<AgentMessage[]>('get_team_messages');
    } catch (e) {
      console.debug('Tauri invoke "get_team_messages" failed. Using mock data.', e);
      return mockMessages;
    }
  },

  async sendDirective(agentId: string | null, content: string): Promise<void> {
    try {
      await invoke('send_directive', { agentId, content });
    } catch (e) {
      console.debug('Tauri invoke "send_directive" failed. Broadcasting directive locally.', e);
    }
  },

  async performAction(actionType: string, payload: Record<string, any>): Promise<void> {
    try {
      switch (actionType) {
        case 'pause_agent': {
          const agentId = payload.agentId || payload.agent_id;
          await invoke('pause_agent', { agentId });
          break;
        }
        case 'resume_agent': {
          const agentId = payload.agentId || payload.agent_id;
          await invoke('resume_agent', { agentId });
          break;
        }
        case 'kill_agent': {
          const agentId = payload.agentId || payload.agent_id;
          await invoke('kill_agent', { agentId });
          break;
        }
        case 'force_validation': {
          const store = await import('../../stores/teamStore');
          const task = store.useTeamStore.getState().tasks.find((t: any) => t.id === payload.taskId);
          const executionId = payload.executionId || payload.execution_id || task?.execution_id || task?.executionId;
          if (!executionId) {
            throw new Error(`Execution ID not found for task ID: ${payload.taskId}`);
          }
          await invoke('force_validation', { executionId });
          break;
        }
        case 'force_review': {
          const store = await import('../../stores/teamStore');
          const task = store.useTeamStore.getState().tasks.find((t: any) => t.id === payload.taskId);
          const executionId = payload.executionId || payload.execution_id || task?.execution_id || task?.executionId;
          if (!executionId) {
            throw new Error(`Execution ID not found for task ID: ${payload.taskId}`);
          }
          await invoke('force_review', { executionId });
          break;
        }
        case 'rollback_task': {
          const store = await import('../../stores/teamStore');
          const task = store.useTeamStore.getState().tasks.find((t: any) => t.id === payload.taskId);
          const executionId = payload.executionId || payload.execution_id || task?.execution_id || task?.executionId;
          if (!executionId) {
            throw new Error(`Execution ID not found for task ID: ${payload.taskId}`);
          }
          await invoke('rollback_task', { executionId });
          break;
        }
        default:
          await invoke('perform_team_action', { actionType, payload });
      }
    } catch (e) {
      console.debug(`Tauri invoke "${actionType}" failed. executing action locally.`, e);
    }
  },

  async initializeDefaultTemplates(projectPath: string): Promise<void> {
    try {
      await invoke('initialize_default_templates', { projectPath });
    } catch (e) {
      console.debug('Tauri invoke "initialize_default_templates" failed.', e);
    }
  },

  async getTemplates(projectPath: string): Promise<any[]> {
    try {
      return await invoke<any[]>('get_templates', { projectPath });
    } catch (e) {
      console.debug('Tauri invoke "get_templates" failed.', e);
      return [];
    }
  },

  async expandTemplate(projectPath: string, templateId: string, prefix: string): Promise<any[]> {
    try {
      return await invoke<any[]>('expand_template', { projectPath, templateId, prefix });
    } catch (e) {
      console.debug('Tauri invoke "expand_template" failed.', e);
      return [];
    }
  },

  async sortAndValidateTasks(tasks: { id: string; dependencies: string[] }[]): Promise<string[]> {
    try {
      return await invoke<string[]>('sort_and_validate_tasks', { tasks });
    } catch (e) {
      console.debug('Tauri invoke "sort_and_validate_tasks" failed.', e);
      return tasks.map(t => t.id);
    }
  },

  async getSwarmArtifacts(projectPath: string): Promise<any[]> {
    try {
      return await invoke<any[]>('get_swarm_artifacts', { projectPath });
    } catch (e) {
      console.debug('Tauri invoke "get_swarm_artifacts" failed.', e);
      return [];
    }
  },

  async promoteSwarmArtifact(projectPath: string, artifactId: string, stage: string): Promise<void> {
    try {
      await invoke('promote_swarm_artifact', { projectPath, artifactId, stage });
    } catch (e) {
      console.debug('Tauri invoke "promote_swarm_artifact" failed.', e);
    }
  },

  async addSwarmArtifact(projectPath: string, taskId: string, filePath: string, stage: string): Promise<any> {
    try {
      return await invoke<any>('add_swarm_artifact', { projectPath, taskId, filePath, stage });
    } catch (e) {
      console.debug('Tauri invoke "add_swarm_artifact" failed.', e);
      return null;
    }
  },

  async indexWorkspace(projectPath: string): Promise<any> {
    try {
      return await invoke<any>('index_workspace', { projectPath });
    } catch (e) {
      console.debug('Tauri invoke "index_workspace" failed.', e);
      return null;
    }
  },

  async getSymbols(projectPath: string): Promise<any[]> {
    try {
      return await invoke<any[]>('get_symbols', { projectPath });
    } catch (e) {
      console.debug('Tauri invoke "get_symbols" failed.', e);
      return [];
    }
  },

  async getRepoMap(projectPath: string): Promise<any[]> {
    try {
      return await invoke<any[]>('get_repo_map', { projectPath });
    } catch (e) {
      console.debug('Tauri invoke "get_repo_map" failed.', e);
      return [];
    }
  }
};
