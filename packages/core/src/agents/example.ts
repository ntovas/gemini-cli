/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import {
  TwoAgentSystem,
  createTwoAgentSystem,
  shouldEnableTwoAgentMode,
  loadTwoAgentConfig,
  validateTwoAgentConfig,
  logTwoAgentConfig,
} from './index.js';

/**
 * Example integration of the two-agent system with the existing CLI
 */
export class TwoAgentCLIIntegration {
  private twoAgentSystem?: TwoAgentSystem;
  private config: Config;
  private isEnabled: boolean;

  constructor(config: Config) {
    this.config = config;
    this.isEnabled = shouldEnableTwoAgentMode(config);
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    if (!this.isEnabled) {
      console.log('Two-agent mode disabled, using traditional single-agent mode');
      return;
    }

    try {
      // Load and validate configuration
      const agentConfig = loadTwoAgentConfig(this.config);
      const validation = validateTwoAgentConfig(agentConfig);
      
      if (!validation.valid) {
        console.error('Two-agent configuration invalid:', validation.errors);
        this.isEnabled = false;
        return;
      }

      // Log configuration if debug mode is enabled
      if (this.config.getDebugMode()) {
        logTwoAgentConfig(agentConfig);
      }

      // Create and initialize the two-agent system
      this.twoAgentSystem = await createTwoAgentSystem(this.config, {
        enabled: true,
        sessionId: this.config.getSessionId(),
        debugMode: this.config.getDebugMode(),
      });

      console.log('Two-agent system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize two-agent system:', error);
      this.isEnabled = false;
    }
  }

  /**
   * Handle user input through the appropriate system
   */
  async handleUserInput(userInput: string): Promise<string> {
    if (this.isEnabled && this.twoAgentSystem) {
      return await this.twoAgentSystem.handleUserInput(userInput);
    }
    
    // Fallback to single-agent mode
    throw new Error('Two-agent system not available, please implement fallback');
  }

  /**
   * Check if two-agent mode is active
   */
  isTwoAgentModeActive(): boolean {
    return this.isEnabled && !!this.twoAgentSystem;
  }

  /**
   * Get system statistics
   */
  getSystemStats() {
    if (!this.twoAgentSystem) {
      return null;
    }

    return {
      mode: 'two-agent',
      stats: this.twoAgentSystem.getStats(),
      status: this.twoAgentSystem.getSystemStatus(),
    };
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.twoAgentSystem) {
      await this.twoAgentSystem.shutdown();
    }
  }
}

/**
 * Factory function to create the CLI integration
 */
export async function createTwoAgentCLIIntegration(config: Config): Promise<TwoAgentCLIIntegration> {
  const integration = new TwoAgentCLIIntegration(config);
  await integration.initialize();
  return integration;
}

/**
 * Helper function to demonstrate the two-agent system
 */
export async function demonstrateTwoAgentSystem(config: Config): Promise<void> {
  console.log('=== Two-Agent System Demonstration ===');
  
  const integration = await createTwoAgentCLIIntegration(config);
  
  if (!integration.isTwoAgentModeActive()) {
    console.log('Two-agent mode not active, demonstration skipped');
    return;
  }

  const testInputs = [
    "What files are in the current directory?",
    "Read the package.json file and tell me about this project",
    "Create a simple hello.txt file with a greeting message",
  ];

  for (const input of testInputs) {
    console.log(`\n--- User Input: ${input} ---`);
    try {
      const response = await integration.handleUserInput(input);
      console.log(`Agent Response: ${response}`);
    } catch (error) {
      console.error(`Error: ${error}`);
    }
  }

  // Show statistics
  const stats = integration.getSystemStats();
  console.log('\n--- System Statistics ---');
  console.log(JSON.stringify(stats, null, 2));

  await integration.shutdown();
  console.log('=== Demonstration Complete ===');
}
