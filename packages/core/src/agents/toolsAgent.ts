/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, Part } from '@google/genai';
import { Config } from '../config/config.js';
import { GeminiClient } from '../core/client.js';
import { DEFAULT_GEMINI_TOOL_MODEL } from '../config/models.js';
import { CoreToolScheduler, convertToFunctionResponse } from '../core/coreToolScheduler.js';
import { ToolCallRequestInfo, ToolCallResponseInfo } from '../core/turn.js';
import { getToolsAgentSystemPrompt } from './prompts.js';
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
  StatusUpdate,
} from './types.js';

/**
 * Tools agent responsible for executing all tools
 * Has access to all tools but limited reasoning capabilities
 */
export class ToolsAgent implements Agent {
  readonly type = AgentType.TOOLS;
  readonly role: AgentRole = {
    type: AgentType.TOOLS,
    name: 'Tools Execution Agent',
    description: 'Responsible for executing all tools and operations',
    capabilities: [
      'File system operations',
      'Shell command execution',
      'Code editing and writing',
      'Search and grep operations',
      'Web fetching',
      'Tool orchestration',
      'Operational tasks',
    ],
    restrictions: [
      'Limited reasoning capabilities',
      'Cannot make strategic decisions',
      'Must follow explicit instructions',
      'Cannot interact with user directly',
    ],
  };

  private geminiClient: GeminiClient;
  private toolScheduler: CoreToolScheduler;
  private context?: AgentContext;
  private onMessageCallback?: (message: AgentA2AMessage) => Promise<void>;

  constructor(private config: Config) {
    this.geminiClient = new GeminiClient(config);
    this.toolScheduler = new CoreToolScheduler({
      config: this.config,
      toolRegistry: this.config.getToolRegistry(),
      outputUpdateHandler: this.handleToolOutput.bind(this),
      onAllToolCallsComplete: this.handleAllToolCallsComplete.bind(this),
      onToolCallsUpdate: this.handleToolCallsUpdate.bind(this),
      getPreferredEditor: () => undefined,
    });
  }

  async initialize(context: AgentContext): Promise<void> {
    this.context = context;
    
    // Initialize Gemini client with tools model
    const contentGeneratorConfig = {
      model: DEFAULT_GEMINI_TOOL_MODEL,
      authType: this.config.getContentGeneratorConfig()?.authType,
      apiKey: this.config.getContentGeneratorConfig()?.apiKey,
      vertexai: this.config.getContentGeneratorConfig()?.vertexai,
    };
    
    await this.geminiClient.initialize(contentGeneratorConfig);
  }

  async processMessage(message: AgentA2AMessage): Promise<AgentA2AMessage | null> {
    switch (message.type) {
      case AgentMessageType.TOOL_EXECUTION_REQUEST:
        return this.handleToolExecutionRequest(message as ToolExecutionRequest);
      
      case AgentMessageType.STATUS_UPDATE:
        return this.handleStatusUpdate(message as StatusUpdate);
      
      default:
        console.warn(`ToolsAgent received unknown message type: ${message.type}`);
        return null;
    }
  }

  async shutdown(): Promise<void> {
    // Cleanup resources
    this.context = undefined;
    this.onMessageCallback = undefined;
  }

  private async handleToolExecutionRequest(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    try {
      // Send status update
      await this.sendStatusUpdate('Starting tool execution...');

      // Process the request to determine what tools to execute
      const toolCalls = await this.analyzeAndCreateToolCalls(request);
      
      // Execute tools using the scheduler
      await this.toolScheduler.schedule(toolCalls, new AbortController().signal);

      // Wait for completion (this is handled by the scheduler callbacks)
      // For now, return a placeholder response
      return {
        id: `tool_response_${Date.now()}`,
        type: AgentMessageType.TOOL_EXECUTION_RESPONSE,
        fromAgent: AgentType.TOOLS,
        toAgent: AgentType.MAIN,
        timestamp: Date.now(),
        content: 'Tool execution completed',
        toolResults: [],
        success: true,
      };
    } catch (error) {
      return {
        id: `tool_response_${Date.now()}`,
        type: AgentMessageType.TOOL_EXECUTION_RESPONSE,
        fromAgent: AgentType.TOOLS,
        toAgent: AgentType.MAIN,
        timestamp: Date.now(),
        content: 'Tool execution failed',
        toolResults: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async handleStatusUpdate(update: StatusUpdate): Promise<AgentA2AMessage | null> {
    // Handle status updates from main agent
    console.log(`Main agent update: ${update.content}`);
    return null;
  }

  private async analyzeAndCreateToolCalls(request: ToolExecutionRequest): Promise<ToolCallRequestInfo[]> {
    // Use the tools model to analyze the request and determine what tools to execute
    const analysisPrompt = `
You are the Tools Agent. Your job is to analyze the following request and determine what tools need to be executed.

Request: ${request.content}

Available context:
${request.context?.map(c => c.parts?.map(p => p.text).join('') || '').join('\n') || 'No context'}

Your role is to:
1. Identify what tools are needed
2. Determine the correct parameters for each tool
3. Plan the execution order

Focus on operational execution, not strategic planning.

Please analyze this request and provide a clear plan for tool execution.
`;

    // Use generateContent with the tools agent system prompt
    const response = await this.geminiClient.generateContent(
      [
        {
          role: 'user',
          parts: [{ text: analysisPrompt }],
        },
      ],
      {
        systemInstruction: getToolsAgentSystemPrompt(),
      },
      new AbortController().signal,
    );

    const responseText = this.extractResponseText(response);
    
    // For now, return empty array - this would need to be implemented
    // to parse the response and create actual tool calls
    return [];
  }

  private async sendStatusUpdate(status: string): Promise<void> {
    if (this.onMessageCallback) {
      const update: StatusUpdate = {
        id: `status_${Date.now()}`,
        type: AgentMessageType.STATUS_UPDATE,
        fromAgent: AgentType.TOOLS,
        toAgent: AgentType.MAIN,
        timestamp: Date.now(),
        content: status,
        status: status,
      };
      
      await this.onMessageCallback(update);
    }
  }

  private handleToolOutput(toolCallId: string, outputChunk: string): void {
    // Handle live tool output
    console.log(`Tool ${toolCallId} output: ${outputChunk}`);
  }

  private handleAllToolCallsComplete(completedToolCalls: any[]): void {
    // Handle completion of all tool calls
    console.log('All tool calls completed:', completedToolCalls);
  }

  private handleToolCallsUpdate(toolCalls: any[]): void {
    // Handle updates to tool calls
    console.log('Tool calls updated:', toolCalls);
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

  /**
   * Set callback for sending messages to main agent
   */
  onMessage(callback: (message: AgentA2AMessage) => Promise<void>): void {
    this.onMessageCallback = callback;
  }

  /**
   * Direct tool execution method for complex operations
   */
  async executeTool(toolName: string, args: any, callId: string): Promise<ToolCallResponseInfo> {
    const toolRegistry = await this.config.getToolRegistry();
    const tool = toolRegistry.getTool(toolName);
    
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    try {
      const result = await tool.execute(args, new AbortController().signal);
      
      const response = convertToFunctionResponse(
        toolName,
        callId,
        result.llmContent,
      );
      
      return {
        callId,
        responseParts: response,
        resultDisplay: result.returnDisplay,
        error: undefined,
      };
    } catch (error) {
      const response = convertToFunctionResponse(
        toolName,
        callId,
        error instanceof Error ? error.message : 'Unknown error',
      );
      
      return {
        callId,
        responseParts: response,
        resultDisplay: `Error executing ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error'),
      };
    }
  }
}
