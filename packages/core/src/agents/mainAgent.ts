/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, Part } from '@google/genai';
import { Config } from '../config/config.js';
import { GeminiClient } from '../core/client.js';
import { getMainAgentSystemPrompt } from './prompts.js';
import { ToolCallResponseInfo } from '../core/turn.js';
import {
  Agent,
  AgentType,
  AgentRole,
  AgentA2AMessage,
  AgentMessageType,
  AgentContext,
  ToolExecutionRequest,
  ToolExecutionResponse,
  PlanningRequest,
  PlanningResponse,
  StatusUpdate,
} from './types.js';

/**
 * Main agent responsible for thinking, planning, and user interaction
 * Does not have access to tools - delegates all tool execution to tools agent
 */
export class MainAgent implements Agent {
  readonly type = AgentType.MAIN;
  readonly role: AgentRole = {
    type: AgentType.MAIN,
    name: 'Main Planning Agent',
    description: 'Responsible for thinking, planning, and user interaction',
    capabilities: [
      'User interaction',
      'Planning and strategy',
      'Code analysis',
      'Problem decomposition',
      'Response generation',
      'Conversation management',
    ],
    restrictions: [
      'Cannot execute tools directly',
      'Must delegate tool execution to tools agent',
      'Cannot access file system directly',
      'Cannot run shell commands',
    ],
  };

  private geminiClient: GeminiClient;
  private context?: AgentContext;
  private onMessageCallback?: (message: AgentA2AMessage) => Promise<void>;

  constructor(private config: Config) {
    this.geminiClient = new GeminiClient(config);
  }

  async initialize(context: AgentContext): Promise<void> {
    this.context = context;
    
    // Initialize Gemini client with main model (not tool model)
    const contentGeneratorConfig = {
      model: this.config.getModel(), // Uses DEFAULT_GEMINI_MODEL
      authType: this.config.getContentGeneratorConfig()?.authType,
      apiKey: this.config.getContentGeneratorConfig()?.apiKey,
      vertexai: this.config.getContentGeneratorConfig()?.vertexai,
    };
    
    await this.geminiClient.initialize(contentGeneratorConfig);
  }

  async processMessage(message: AgentA2AMessage): Promise<AgentA2AMessage | null> {
    switch (message.type) {
      case AgentMessageType.PLANNING_REQUEST:
        return this.handlePlanningRequest(message as PlanningRequest);
      
      case AgentMessageType.TOOL_EXECUTION_RESPONSE:
        return this.handleToolExecutionResponse(message as ToolExecutionResponse);
      
      case AgentMessageType.STATUS_UPDATE:
        return this.handleStatusUpdate(message as StatusUpdate);
      
      default:
        console.warn(`MainAgent received unknown message type: ${message.type}`);
        return null;
    }
  }

  async shutdown(): Promise<void> {
    // Cleanup resources
    this.context = undefined;
    this.onMessageCallback = undefined;
  }

  /**
   * Main entry point for user interactions
   */
  async handleUserInput(userInput: string): Promise<string> {
    if (!this.context) {
      throw new Error('Agent not initialized');
    }

    // Create system prompt for main agent
    const systemPrompt = this.getMainAgentSystemPrompt();
    
    // Create conversation content
    const conversationContent: Content[] = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }],
      },
      {
        role: 'model',
        parts: [{ text: 'I understand. I am the main planning agent and will work with the tools agent to help you.' }],
      },
      ...this.context.conversationHistory,
      {
        role: 'user',
        parts: [{ text: userInput }],
      },
    ];

    // Generate response using main model
    const response = await this.geminiClient.generateContent(
      conversationContent,
      {},
      new AbortController().signal,
    );

    const responseText = this.extractResponseText(response);
    
    // Check if the response indicates need for tool execution
    const toolExecutionNeeded = await this.analyzeForToolExecution(responseText, userInput);
    
    if (toolExecutionNeeded) {
      // Delegate to tools agent
      const toolRequest = await this.createToolExecutionRequest(userInput, responseText);
      if (this.onMessageCallback) {
        await this.onMessageCallback(toolRequest);
      }
      
      return `I've analyzed your request and am coordinating with the tools agent to execute the necessary operations. Please wait...`;
    }

    // Update conversation history
    this.context.conversationHistory.push(
      {
        role: 'user',
        parts: [{ text: userInput }],
      },
      {
        role: 'model',
        parts: [{ text: responseText }],
      },
    );

    return responseText;
  }

  private async handlePlanningRequest(request: PlanningRequest): Promise<PlanningResponse> {
    const planningPrompt = `
You are the main planning agent. The tools agent is requesting guidance on how to handle this situation:

Situation: ${request.situation}
Available Tools: ${request.availableTools.join(', ')}

Please provide a clear plan and specify which tools should be used in what order.
Focus on the strategy and approach, not the detailed execution.
`;

    const response = await this.geminiClient.generateContent(
      [
        {
          role: 'user',
          parts: [{ text: planningPrompt }],
        },
      ],
      {},
      new AbortController().signal,
    );

    const responseText = this.extractResponseText(response);
    
    // Parse the response to extract plan and tools
    const plan = this.extractPlanFromResponse(responseText);
    const toolsToUse = this.extractToolsFromResponse(responseText, request.availableTools);

    return {
      id: `planning_${Date.now()}`,
      type: AgentMessageType.PLANNING_RESPONSE,
      fromAgent: AgentType.MAIN,
      toAgent: AgentType.TOOLS,
      timestamp: Date.now(),
      content: responseText,
      plan,
      nextSteps: plan.split('\n').filter(step => step.trim()),
      toolsToUse,
    };
  }

  private async handleToolExecutionResponse(response: ToolExecutionResponse): Promise<AgentA2AMessage | null> {
    if (!this.context) return null;

    // Process tool results and generate final response to user
    const toolResults = response.toolResults;
    const finalResponse = await this.generateFinalResponseFromToolResults(toolResults);

    // Update conversation history with tool results
    this.context.conversationHistory.push({
      role: 'model',
      parts: [{ text: finalResponse }],
    });

    return {
      id: `response_${Date.now()}`,
      type: AgentMessageType.STATUS_UPDATE,
      fromAgent: AgentType.MAIN,
      toAgent: AgentType.TOOLS,
      timestamp: Date.now(),
      content: finalResponse,
      status: 'tool_results_processed',
      metadata: {
        toolResults: toolResults,
        finalResponse: true,
      },
    };
  }

  private async handleStatusUpdate(update: StatusUpdate): Promise<AgentA2AMessage | null> {
    // Handle status updates from tools agent
    console.log(`Tools agent update: ${update.content}`);
    return null;
  }

  private getMainAgentSystemPrompt(): string {
    return getMainAgentSystemPrompt();
  }

  private async analyzeForToolExecution(response: string, userInput: string): Promise<boolean> {
    // Simple heuristic to determine if tool execution is needed
    const toolKeywords = [
      'read file', 'write file', 'create file', 'delete file',
      'run command', 'execute', 'shell', 'terminal',
      'search', 'find', 'grep', 'list files',
      'edit', 'modify', 'update', 'change',
    ];

    const needsTools = toolKeywords.some(keyword => 
      userInput.toLowerCase().includes(keyword) || 
      response.toLowerCase().includes(keyword)
    );

    return needsTools;
  }

  private async createToolExecutionRequest(userInput: string, planResponse: string): Promise<ToolExecutionRequest> {
    // This would need to be implemented based on the specific tool call format
    // For now, returning a placeholder
    return {
      id: `tool_request_${Date.now()}`,
      type: AgentMessageType.TOOL_EXECUTION_REQUEST,
      fromAgent: AgentType.MAIN,
      toAgent: AgentType.TOOLS,
      timestamp: Date.now(),
      content: `Execute tools for: ${userInput}`,
      toolCalls: [], // Would need to parse and create actual tool calls
      context: this.context?.conversationHistory,
    };
  }

  private extractResponseText(response: any): string {
    // Extract text from Gemini response
    const candidate = response.candidates?.[0];
    const content = candidate?.content;
    const parts = content?.parts || [];
    
    return parts
      .filter((part: Part) => part.text)
      .map((part: Part) => part.text)
      .join('');
  }

  private extractPlanFromResponse(response: string): string {
    // Extract plan from response text
    return response;
  }

  private extractToolsFromResponse(response: string, availableTools: string[]): string[] {
    // Extract which tools should be used from the response
    return availableTools.filter(tool => 
      response.toLowerCase().includes(tool.toLowerCase())
    );
  }

  private async generateFinalResponseFromToolResults(toolResults: ToolCallResponseInfo[]): Promise<string> {
    // Generate final response based on tool execution results
    const resultsText = toolResults.map(result => 
      `Tool ${result.callId}: ${result.resultDisplay || 'Executed successfully'}`
    ).join('\n');

    const synthesisPrompt = `
Based on the following tool execution results, provide a clear and helpful response to the user:

${resultsText}

Synthesize these results into a coherent response that directly addresses the user's needs.
`;

    const response = await this.geminiClient.generateContent(
      [
        {
          role: 'user',
          parts: [{ text: synthesisPrompt }],
        },
      ],
      {},
      new AbortController().signal,
    );

    return this.extractResponseText(response);
  }

  /**
   * Set callback for sending messages to tools agent
   */
  onMessage(callback: (message: AgentA2AMessage) => Promise<void>): void {
    this.onMessageCallback = callback;
  }
}
