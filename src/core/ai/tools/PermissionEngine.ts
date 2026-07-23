import { RiskLevel, PermissionPolicy, ToolDefinition } from '../protocol';
import { EventBus } from '../../events';

/**
 * Result of a permission check.
 */
export type PermissionDecision = 'allowed' | 'needs_approval' | 'denied';

/**
 * Evaluates tool risk levels against user policies.
 */
export class PermissionEngine {
  private policies: Record<RiskLevel, PermissionPolicy>;
  private auditLog: Array<{ timestamp: number; toolId: string; riskLevel: RiskLevel; policy: PermissionPolicy; decision: PermissionDecision }> = [];

  constructor() {
    this.policies = {
      safe: 'always_allow',
      read: 'always_allow',
      write: 'ask',
      terminal: 'ask',
      network: 'ask',
      browser: 'ask',
      dangerous: 'never'
    };
  }

  /**
   * Checks if a tool is permitted to execute based on its risk level and current policies.
   * @param toolDef The tool definition to check
   * @returns The permission decision
   */
  public checkPermission(toolDef: ToolDefinition): PermissionDecision {
    const policy = this.policies[toolDef.riskLevel] || 'never';
    
    let decision: PermissionDecision;
    switch (policy) {
      case 'always_allow':
        decision = 'allowed';
        break;
      case 'ask':
        decision = 'needs_approval';
        break;
      case 'never':
      default:
        decision = 'denied';
        break;
    }

    this.auditLog.push({
      timestamp: Date.now(),
      toolId: toolDef.id,
      riskLevel: toolDef.riskLevel,
      policy,
      decision
    });

    if (decision === 'denied') {
      EventBus.publish('tool:permission_denied', { 
        toolId: toolDef.id, 
        riskLevel: toolDef.riskLevel,
        policy 
      });
    }

    return decision;
  }

  /**
   * Updates the policy for a specific risk level.
   * @param risk The risk level
   * @param policy The new policy
   */
  public updatePolicy(risk: RiskLevel, policy: PermissionPolicy): void {
    this.policies[risk] = policy;
  }

  /**
   * Gets the audit log of all permission checks.
   */
  public getAuditLog() {
    return this.auditLog;
  }
}
