/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { Config } from '../config/config.js';
import { MainAgent } from './mainAgent.js';
import { ToolsAgent } from './toolsAgent.js';
import {
  Agent,
  AgentType,
  AgentA2AMessage,
  AgentContext,
  AgentCommunicationInterface,
} from './types.js';

/**
 * Agent-to-Agent communication bus
 * Handles message routing between main and tools agents
 */
export class AgentCommunicationBus extends EventEmitter implements AgentCommunicationInterface {
  private agents: Map<AgentType, Agent> = new Map();
  private messageHistory: AgentA2AMessage[] = [];

  constructor(private agentType: AgentType) {
    super();
  }

  async sendMessage(message: AgentA2AMessage): Promise<void> {
    this.messageHistory.push(message);
    console.log(`[A2A] ${message.fromAgent} -> ${message.toAgent}: ${message.type}`);
    
    // Emit message to the target agent
    this.emit('message', message);
  }

  onMessage(callback: (message: AgentA2AMessage) => Promise<void>): void {
    this.on('message', callback);
  }

  getAgentType(): AgentType {
    return this.agentType;
  }

  getMessageHistory(): AgentA2AMessage[] {
    return [...this.messageHistory];
  }

  clearHistory(): void {
    this.messageHistory = [];
  }
}

/**
 * Agent orchestrator that manages the two-agent system
 */
export class AgentOrchestrator {
  private mainAgent: MainAgent;
  private toolsAgent: ToolsAgent;
  private mainAgentBus: AgentCommunicationBus;
  private toolsAgentBus: AgentCommunicationBus;
  private isInitialized = false;

  constructor(private config: Config) {
    this.mainAgent = new MainAgent(config);
    this.toolsAgent = new ToolsAgent(config);
    this.mainAgentBus = new AgentCommunicationBus(AgentType.MAIN);
    this.toolsAgentBus = new AgentCommunicationBus(AgentType.TOOLS);
    
    this.setupCommunication();
  }

  async initialize(sessionId: string): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Agent orchestrator already initialized');
    }

    const context: AgentContext = {
      sessionId,
      conversationHistory: [],
      metadata: {},
    };

    // Initialize both agents
    await this.mainAgent.initialize(context);
    await this.toolsAgent.initialize(context);

    this.isInitialized = true;
    console.log('Agent orchestrator initialized with two-agent system');
  }

  private setupCommunication(): void {
    // Set up message routing between agents
    this.mainAgentBus.onMessage(async (message: AgentA2AMessage) => {
      if (message.toAgent === AgentType.TOOLS) {
        const response = await this.toolsAgent.processMessage(message);
        if (response) {
          await this.toolsAgentBus.sendMessage(response);
        }
      }
    });

    this.toolsAgentBus.onMessage(async (message: AgentA2AMessage) => {
      if (message.toAgent === AgentType.MAIN) {
        const response = await this.mainAgent.processMessage(message);
        if (response) {
          await this.mainAgentBus.sendMessage(response);
        }
      }
    });

    // Connect agents to their communication buses
    this.mainAgent.onMessage(async (message: AgentA2AMessage) => {
      await this.mainAgentBus.sendMessage(message);
    });

    this.toolsAgent.onMessage(async (message: AgentA2AMessage) => {
      await this.toolsAgentBus.sendMessage(message);
    });
  }

  /**
   * Main entry point for user interactions
   */
  async handleUserInput(userInput: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Agent orchestrator not initialized');
    }

    try {
      // Route user input to main agent
      const response = await this.mainAgent.handleUserInput(userInput);
      return response;
    } catch (error) {
      console.error('Error handling user input:', error);
      return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Get the main agent for direct access
   */
  getMainAgent(): MainAgent {
    return this.mainAgent;
  }

  /**
   * Get the tools agent for direct access
   */
  getToolsAgent(): ToolsAgent {
    return this.toolsAgent;
  }

  /**
   * Get communication statistics
   */
  getCommunicationStats(): {
    mainAgentMessages: number;
    toolsAgentMessages: number;
    totalMessages: number;
    messagesSent: number;
    messagesReceived: number;
    activeAgents: number;
  } {
    const mainMessages = this.mainAgentBus.getMessageHistory().length;
    const toolsMessages = this.toolsAgentBus.getMessageHistory().length;
    
    return {
      mainAgentMessages: mainMessages,
      toolsAgentMessages: toolsMessages,
      totalMessages: mainMessages + toolsMessages,
      messagesSent: mainMessages + toolsMessages,
      messagesReceived: mainMessages + toolsMessages,
      activeAgents: this.isInitialized ? 2 : 0,
    };
  }

  /**
   * Get full message history from both agents
   */
  getFullMessageHistory(): AgentA2AMessage[] {
    const mainHistory = this.mainAgentBus.getMessageHistory();
    const toolsHistory = this.toolsAgentBus.getMessageHistory();
    
    return [...mainHistory, ...toolsHistory]
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Clear all communication history
   */
  clearHistory(): void {
    this.mainAgentBus.clearHistory();
    this.toolsAgentBus.clearHistory();
  }

  /**
   * Shutdown the orchestrator and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    await this.mainAgent.shutdown();
    await this.toolsAgent.shutdown();
    this.isInitialized = false;
  }

  // Add reset method for testing
  reset(): void {
    this.isInitialized = false;
    // Clear communication buses
    this.mainAgentBus = new AgentCommunicationBus(AgentType.MAIN);
    this.toolsAgentBus = new AgentCommunicationBus(AgentType.TOOLS);
    this.setupCommunication();
  }

  /**
   * Get system status
   */
  getStatus(): {
    initialized: boolean;
    mainAgentType: AgentType;
    toolsAgentType: AgentType;
    communicationStats: {
      mainAgentMessages: number;
      toolsAgentMessages: number;
      totalMessages: number;
    };
  } {
    return {
      initialized: this.isInitialized,
      mainAgentType: this.mainAgent.type,
      toolsAgentType: this.toolsAgent.type,
      communicationStats: this.getCommunicationStats(),
    };
  }
}
