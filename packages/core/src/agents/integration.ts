/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, Part } from '@google/genai';
import { Config } from '../config/config.js';
import { AgentOrchestrator } from './orchestrator.js';
import { ToolCallRequestInfo, ToolCallResponseInfo } from '../core/turn.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_TOOL_MODEL } from '../config/models.js';

/**
 * Configuration for the two-agent system
 */
export interface TwoAgentSystemConfig {
  enabled: boolean;
  mainAgentModel?: string;
  toolsAgentModel?: string;
  sessionId: string;
  debugMode?: boolean;
}

/**
 * Integration layer for the two-agent system
 * Provides a bridge between the existing CLI architecture and the new agent system
 */
export class TwoAgentSystem {
  private orchestrator: AgentOrchestrator;
  private isEnabled: boolean;
  private config: TwoAgentSystemConfig;

  constructor(
    private coreConfig: Config,
    config: TwoAgentSystemConfig
  ) {
    this.config = config;
    this.isEnabled = config.enabled;
    this.orchestrator = new AgentOrchestrator(coreConfig);
  }

  /**
   * Initialize the two-agent system
   */
  async initialize(): Promise<void> {
    if (!this.isEnabled) {
      console.log('Two-agent system disabled, using single-agent mode');
      return;
    }

    console.log('Initializing two-agent system...');
    console.log(`Main Agent Model: ${this.config.mainAgentModel || DEFAULT_GEMINI_MODEL}`);
    console.log(`Tools Agent Model: ${this.config.toolsAgentModel || DEFAULT_GEMINI_TOOL_MODEL}`);

    await this.orchestrator.initialize(this.config.sessionId);
    
    if (this.config.debugMode) {
      console.log('Two-agent system initialized successfully');
      console.log('Agent status:', this.orchestrator.getStatus());
    }
  }

  /**
   * Check if the two-agent system is enabled
   */
  isAgentSystemEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Handle user input through the agent system
   */
  async handleUserInput(userInput: string): Promise<string> {
    if (!this.isEnabled) {
      throw new Error('Two-agent system not enabled');
    }

    return await this.orchestrator.handleUserInput(userInput);
  }

  /**
   * Execute tools through the tools agent
   */
  async executeTools(toolCalls: ToolCallRequestInfo[]): Promise<ToolCallResponseInfo[]> {
    if (!this.isEnabled) {
      throw new Error('Two-agent system not enabled');
    }

    const toolsAgent = this.orchestrator.getToolsAgent();
    const results: ToolCallResponseInfo[] = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await toolsAgent.executeTool(
          toolCall.name,
          toolCall.args,
          toolCall.callId
        );
        results.push(result);
      } catch (error) {
        results.push({
          callId: toolCall.callId,
          responseParts: {
            functionResponse: {
              id: toolCall.callId,
              name: toolCall.name,
              response: {
                error: error instanceof Error ? error.message : 'Unknown error',
              },
            },
          },
          resultDisplay: `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    }

    return results;
  }

  /**
   * Get the main agent for direct interaction
   */
  getMainAgent() {
    if (!this.isEnabled) {
      throw new Error('Two-agent system not enabled');
    }
    return this.orchestrator.getMainAgent();
  }

  /**
   * Get the tools agent for direct interaction
   */
  getToolsAgent() {
    if (!this.isEnabled) {
      throw new Error('Two-agent system not enabled');
    }
    return this.orchestrator.getToolsAgent();
  }

  /**
   * Get communication statistics
   */
  getStats() {
    if (!this.isEnabled) {
      return null;
    }
    return this.orchestrator.getCommunicationStats();
  }

  /**
   * Get full message history for debugging
   */
  getMessageHistory() {
    if (!this.isEnabled) {
      return [];
    }
    return this.orchestrator.getFullMessageHistory();
  }

  /**
   * Enable debug mode
   */
  enableDebugMode(): void {
    this.config.debugMode = true;
  }

  /**
   * Disable debug mode
   */
  disableDebugMode(): void {
    this.config.debugMode = false;
  }

  /**
   * Shutdown the agent system
   */
  async shutdown(): Promise<void> {
    if (this.isEnabled) {
      await this.orchestrator.shutdown();
    }
  }

  /**
   * Clear all agent communication history
   */
  clearHistory(): void {
    if (this.isEnabled) {
      this.orchestrator.clearHistory();
    }
  }

  /**
   * Get system status for monitoring
   */
  getSystemStatus() {
    if (!this.isEnabled) {
      return {
        enabled: false,
        status: 'disabled',
      };
    }

    return {
      enabled: true,
      status: 'active',
      ...this.orchestrator.getStatus(),
    };
  }
}

/**
 * Factory function to create and configure the two-agent system
 */
export async function createTwoAgentSystem(
  config: Config,
  options: Partial<TwoAgentSystemConfig> = {}
): Promise<TwoAgentSystem> {
  const systemConfig: TwoAgentSystemConfig = {
    enabled: true,
    mainAgentModel: DEFAULT_GEMINI_MODEL,
    toolsAgentModel: DEFAULT_GEMINI_TOOL_MODEL,
    sessionId: config.getSessionId(),
    debugMode: config.getDebugMode(),
    ...options,
  };

  const twoAgentSystem = new TwoAgentSystem(config, systemConfig);
  // Don't initialize here, let the caller decide when to initialize
  
  return twoAgentSystem;
}

/**
 * Helper function to check if two-agent mode should be enabled
 */
export function shouldEnableTwoAgentMode(config: Config): boolean {
  // Check environment variable
  const envEnabled = process.env.GEMINI_TWO_AGENT_MODE;
  if (envEnabled !== undefined) {
    return ['true', '1', 'yes', 'on'].includes(envEnabled.toLowerCase());
  }

  // Default to enabled if DEFAULT_GEMINI_TOOL_MODEL is available
  return !!DEFAULT_GEMINI_TOOL_MODEL;
}
