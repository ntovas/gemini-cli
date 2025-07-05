/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { TwoAgentSystem, createTwoAgentSystem } from '../agents/index.js';

/**
 * CLI integration for the two-agent system
 * Provides a bridge between the CLI and the agent system
 */
export class AgentCliIntegration {
  private twoAgentSystem: TwoAgentSystem | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    if (this.config.isTwoAgentModeEnabled()) {
      console.log('Two-agent mode enabled, initializing agent system...');
      this.twoAgentSystem = await createTwoAgentSystem(this.config);
      await this.twoAgentSystem.initialize();
      console.log('Agent system initialized successfully');
    }
  }

  /**
   * Check if two-agent mode is enabled and ready
   */
  isAgentSystemReady(): boolean {
    return this.twoAgentSystem !== null && this.twoAgentSystem.isAgentSystemEnabled();
  }

  /**
   * Process user input through the appropriate system
   */
  async processUserInput(input: string): Promise<string> {
    if (this.isAgentSystemReady()) {
      return await this.twoAgentSystem!.handleUserInput(input);
    }
    
    // Fallback to regular processing
    throw new Error('Agent system not ready, fallback to regular processing');
  }

  /**
   * Check if this integration should handle the request
   */
  shouldHandle(): boolean {
    return this.config.isTwoAgentModeEnabled() && this.isAgentSystemReady();
  }

  /**
   * Shutdown the integration
   */
  async shutdown(): Promise<void> {
    if (this.twoAgentSystem) {
      await this.twoAgentSystem.shutdown();
      this.twoAgentSystem = null;
    }
  }

  /**
   * Get system status for debugging
   */
  getStatus() {
    return {
      enabled: this.config.isTwoAgentModeEnabled(),
      ready: this.isAgentSystemReady(),
      systemStatus: this.twoAgentSystem?.getSystemStatus() || null,
    };
  }
}

/**
 * Factory function to create the CLI integration
 */
export function createAgentCliIntegration(config: Config): AgentCliIntegration {
  return new AgentCliIntegration(config);
}
