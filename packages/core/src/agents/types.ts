/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, Part } from '@google/genai';
import { ToolCallRequestInfo, ToolCallResponseInfo } from '../core/turn.js';

/**
 * Agent types for the two-agent system
 */
export enum AgentType {
  MAIN = 'main',
  TOOLS = 'tools',
}

/**
 * Agent role definitions
 */
export interface AgentRole {
  type: AgentType;
  name: string;
  description: string;
  capabilities: string[];
  restrictions: string[];
}

/**
 * Communication message types between agents
 */
export enum AgentMessageType {
  TOOL_EXECUTION_REQUEST = 'tool_execution_request',
  TOOL_EXECUTION_RESPONSE = 'tool_execution_response',
  PLANNING_REQUEST = 'planning_request',
  PLANNING_RESPONSE = 'planning_response',
  STATUS_UPDATE = 'status_update',
  ERROR = 'error',
}

/**
 * Base message structure for agent-to-agent communication
 */
export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  fromAgent: AgentType;
  toAgent: AgentType;
  timestamp: number;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool execution request from main agent to tools agent
 */
export interface ToolExecutionRequest extends AgentMessage {
  type: AgentMessageType.TOOL_EXECUTION_REQUEST;
  toolCalls: ToolCallRequestInfo[];
  context?: Content[];
}

/**
 * Tool execution response from tools agent to main agent
 */
export interface ToolExecutionResponse extends AgentMessage {
  type: AgentMessageType.TOOL_EXECUTION_RESPONSE;
  toolResults: ToolCallResponseInfo[];
  success: boolean;
  error?: string;
}

/**
 * Planning request from tools agent to main agent
 */
export interface PlanningRequest extends AgentMessage {
  type: AgentMessageType.PLANNING_REQUEST;
  situation: string;
  availableTools: string[];
  context?: Content[];
}

/**
 * Planning response from main agent to tools agent
 */
export interface PlanningResponse extends AgentMessage {
  type: AgentMessageType.PLANNING_RESPONSE;
  plan: string;
  nextSteps: string[];
  toolsToUse: string[];
}

/**
 * Status update message
 */
export interface StatusUpdate extends AgentMessage {
  type: AgentMessageType.STATUS_UPDATE;
  status: string;
  progress?: number;
}

/**
 * Error message
 */
export interface ErrorMessage extends AgentMessage {
  type: AgentMessageType.ERROR;
  error: string;
  stack?: string;
}

/**
 * Union type for all agent messages
 */
export type AgentA2AMessage =
  | ToolExecutionRequest
  | ToolExecutionResponse
  | PlanningRequest
  | PlanningResponse
  | StatusUpdate
  | ErrorMessage;

/**
 * Agent communication interface
 */
export interface AgentCommunicationInterface {
  sendMessage(message: AgentA2AMessage): Promise<void>;
  onMessage(callback: (message: AgentA2AMessage) => Promise<void>): void;
  getAgentType(): AgentType;
}

/**
 * Agent execution context
 */
export interface AgentContext {
  sessionId: string;
  conversationHistory: Content[];
  currentTask?: string;
  metadata: Record<string, unknown>;
}

/**
 * Base agent interface
 */
export interface Agent {
  readonly type: AgentType;
  readonly role: AgentRole;
  initialize(context: AgentContext): Promise<void>;
  processMessage(message: AgentA2AMessage): Promise<AgentA2AMessage | null>;
  shutdown(): Promise<void>;
}
