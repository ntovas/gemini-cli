# Gemini Core Agent Mode Implementation Analysis

## Overview

The Gemini Core agent mode is implemented as an agentic loop that continuously processes user inputs, generates responses, executes tools, and iterates until no more tool calls are needed. The implementation consists of several key components working together to create a sophisticated conversational AI agent.

## Core Components

### 1. GeminiClient - Main Orchestrator
**File**: `packages/core/src/core/client.ts`

The `GeminiClient` class serves as the main entry point for the agent mode:

```typescript
export class GeminiClient {
  private chat?: GeminiChat;
  private contentGenerator?: ContentGenerator;
  private readonly MAX_TURNS = 100;
  private readonly TOKEN_THRESHOLD_FOR_SUMMARIZATION = 0.7;

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    turns: number = this.MAX_TURNS,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    // Ensure turns never exceeds MAX_TURNS to prevent infinite loops
    const boundedTurns = Math.min(turns, this.MAX_TURNS);
    if (!boundedTurns) {
      return new Turn(this.getChat());
    }

    const compressed = await this.tryCompressChat();
    if (compressed) {
      yield { type: GeminiEventType.ChatCompressed, value: compressed };
    }
    
    // Create a new turn and execute it
    const turn = new Turn(this.getChat());
    const resultStream = turn.run(request, signal);
    
    // Stream events from the turn
    for await (const event of resultStream) {
      yield event;
    }
    
    // KEY ITERATION LOGIC: Check if model should continue
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      const nextSpeakerCheck = await checkNextSpeaker(
        this.getChat(),
        this,
        signal,
      );
      if (nextSpeakerCheck?.next_speaker === 'model') {
        const nextRequest = [{ text: 'Please continue.' }];
        // Recursive call to continue the conversation
        yield* this.sendMessageStream(nextRequest, signal, boundedTurns - 1);
      }
    }
    return turn;
  }
}
```

### 2. Turn - Single Conversation Turn
**File**: `packages/core/src/core/turn.ts`

The `Turn` class manages a single conversation turn and handles tool call detection:

```typescript
export class Turn {
  readonly pendingToolCalls: ToolCallRequestInfo[];
  private debugResponses: GenerateContentResponse[];

  constructor(private readonly chat: GeminiChat) {
    this.pendingToolCalls = [];
    this.debugResponses = [];
  }

  async *run(
    req: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    try {
      const responseStream = await this.chat.sendMessageStream({
        message: req,
        config: {
          abortSignal: signal,
        },
      });

      for await (const resp of responseStream) {
        if (signal?.aborted) {
          yield { type: GeminiEventType.UserCancelled };
          return;
        }
        
        this.debugResponses.push(resp);

        // Handle thinking mode (for supported models)
        const thoughtPart = resp.candidates?.[0]?.content?.parts?.[0];
        if (thoughtPart?.thought) {
          const rawText = thoughtPart.text ?? '';
          const subjectStringMatches = rawText.match(/\*\*(.*?)\*\*/s);
          const subject = subjectStringMatches ? subjectStringMatches[1].trim() : '';
          const description = rawText.replace(/\*\*(.*?)\*\*/s, '').trim();
          
          yield {
            type: GeminiEventType.Thought,
            value: { subject, description },
          };
          continue;
        }

        // Extract text content
        const text = getResponseText(resp);
        if (text) {
          yield { type: GeminiEventType.Content, value: text };
        }

        // CRITICAL: Handle function calls (tool requests)
        const functionCalls = resp.functionCalls ?? [];
        for (const fnCall of functionCalls) {
          const event = this.handlePendingFunctionCall(fnCall);
          if (event) {
            yield event;
          }
        }
      }
    } catch (e) {
      // Error handling...
    }
  }

  private handlePendingFunctionCall(
    fnCall: FunctionCall,
  ): ServerGeminiStreamEvent | null {
    const callId = fnCall.id ?? `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = fnCall.name || 'undefined_tool_name';
    const args = (fnCall.args || {}) as Record<string, unknown>;

    const toolCallRequest: ToolCallRequestInfo = {
      callId,
      name,
      args,
      isClientInitiated: false,
    };

    // Add to pending tool calls
    this.pendingToolCalls.push(toolCallRequest);

    // Yield a request for the tool call
    return { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
  }
}
```

### 3. CoreToolScheduler - Tool Execution Manager
**File**: `packages/core/src/core/coreToolScheduler.ts`

The `CoreToolScheduler` manages the execution of tools requested by the model:

```typescript
export class CoreToolScheduler {
  private toolCalls: ToolCall[] = [];
  private approvalMode: ApprovalMode;

  async schedule(
    request: ToolCallRequestInfo | ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<void> {
    if (this.isRunning()) {
      throw new Error('Cannot schedule new tool calls while other tool calls are actively running');
    }
    
    const requestsToProcess = Array.isArray(request) ? request : [request];
    const toolRegistry = await this.toolRegistry;

    // Create new tool calls
    const newToolCalls: ToolCall[] = requestsToProcess.map((reqInfo): ToolCall => {
      const toolInstance = toolRegistry.getTool(reqInfo.name);
      if (!toolInstance) {
        return {
          status: 'error',
          request: reqInfo,
          response: createErrorResponse(reqInfo, new Error(`Tool "${reqInfo.name}" not found`)),
          durationMs: 0,
        };
      }
      return {
        status: 'validating',
        request: reqInfo,
        tool: toolInstance,
        startTime: Date.now(),
      };
    });

    this.toolCalls = this.toolCalls.concat(newToolCalls);

    // Process each tool call
    for (const toolCall of newToolCalls) {
      if (toolCall.status !== 'validating') continue;

      const { request: reqInfo, tool: toolInstance } = toolCall;
      
      try {
        if (this.approvalMode === ApprovalMode.YOLO) {
          this.setStatusInternal(reqInfo.callId, 'scheduled');
        } else {
          const confirmationDetails = await toolInstance.shouldConfirmExecute(
            reqInfo.args,
            signal,
          );

          if (confirmationDetails) {
            this.setStatusInternal(reqInfo.callId, 'awaiting_approval', confirmationDetails);
          } else {
            this.setStatusInternal(reqInfo.callId, 'scheduled');
          }
        }
      } catch (error) {
        this.setStatusInternal(reqInfo.callId, 'error', createErrorResponse(reqInfo, error));
      }
    }
    
    this.attemptExecutionOfScheduledCalls(signal);
  }

  private attemptExecutionOfScheduledCalls(signal: AbortSignal): void {
    const callsToExecute = this.toolCalls.filter(call => call.status === 'scheduled');

    callsToExecute.forEach((toolCall) => {
      if (toolCall.status !== 'scheduled') return;

      const { callId, name: toolName } = toolCall.request;
      this.setStatusInternal(callId, 'executing');

      // Execute the tool
      toolCall.tool
        .execute(toolCall.request.args, signal)
        .then((toolResult: ToolResult) => {
          if (signal.aborted) {
            this.setStatusInternal(callId, 'cancelled', 'User cancelled tool execution.');
            return;
          }

          const response = convertToFunctionResponse(toolName, callId, toolResult.llmContent);
          const successResponse: ToolCallResponseInfo = {
            callId,
            responseParts: response,
            resultDisplay: toolResult.returnDisplay,
            error: undefined,
          };
          
          this.setStatusInternal(callId, 'success', successResponse);
        })
        .catch((executionError: Error) => {
          this.setStatusInternal(callId, 'error', createErrorResponse(toolCall.request, executionError));
        });
    });
  }
}
```

### 4. Non-Interactive Mode Implementation
**File**: `packages/cli/src/nonInteractiveCli.ts`

The non-interactive mode shows the core iteration loop:

```typescript
export async function runNonInteractive(config: Config, input: string): Promise<void> {
  const geminiClient = config.getGeminiClient();
  const toolRegistry: ToolRegistry = await config.getToolRegistry();
  const chat = await geminiClient.getChat();
  const abortController = new AbortController();
  
  let currentMessages: Content[] = [{ role: 'user', parts: [{ text: input }] }];

  try {
    // MAIN ITERATION LOOP
    while (true) {
      const functionCalls: FunctionCall[] = [];

      // Send message and collect responses
      const responseStream = await chat.sendMessageStream({
        message: currentMessages[0]?.parts || [],
        config: {
          abortSignal: abortController.signal,
          tools: [{ functionDeclarations: toolRegistry.getFunctionDeclarations() }],
        },
      });

      // Process streaming response
      for await (const resp of responseStream) {
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          return;
        }
        
        const textPart = getResponseText(resp);
        if (textPart) {
          process.stdout.write(textPart);
        }
        
        // Collect function calls
        if (resp.functionCalls) {
          functionCalls.push(...resp.functionCalls);
        }
      }

      // TOOL EXECUTION PHASE
      if (functionCalls.length > 0) {
        const toolResponseParts: Part[] = [];

        for (const fc of functionCalls) {
          const callId = fc.id ?? `${fc.name}-${Date.now()}`;
          const requestInfo: ToolCallRequestInfo = {
            callId,
            name: fc.name as string,
            args: (fc.args ?? {}) as Record<string, unknown>,
            isClientInitiated: false,
          };

          // Execute tool
          const toolResponse = await executeToolCall(
            config,
            requestInfo,
            toolRegistry,
            abortController.signal,
          );

          if (toolResponse.error) {
            console.error(`Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`);
            if (!toolResponse.error.message.includes('not found in registry')) {
              process.exit(1);
            }
          }

          // Convert tool response to parts for next iteration
          if (toolResponse.responseParts) {
            const parts = Array.isArray(toolResponse.responseParts)
              ? toolResponse.responseParts
              : [toolResponse.responseParts];
            for (const part of parts) {
              if (typeof part === 'string') {
                toolResponseParts.push({ text: part });
              } else if (part) {
                toolResponseParts.push(part);
              }
            }
          }
        }
        
        // ITERATION: Set up next message with tool responses
        currentMessages = [{ role: 'user', parts: toolResponseParts }];
      } else {
        // No more tool calls, exit the loop
        process.stdout.write('\n');
        return;
      }
    }
  } catch (error) {
    console.error(parseAndFormatApiError(error, config.getContentGeneratorConfig().authType));
    process.exit(1);
  }
}
```

## Agent Mode Iteration Flow

The agent mode follows this iteration pattern:

1. **Initial Input**: User provides input or the system sends "Please continue."
2. **Model Response**: The model generates a response, which may contain:
   - Text content
   - Function calls (tool requests)
   - Thoughts (for supported models)
3. **Tool Execution**: If function calls are present:
   - Tools are scheduled and executed
   - Results are formatted as function responses
4. **Continuation Check**: After tool execution:
   - If there are pending tool calls, continue processing
   - If no tool calls and continuation is needed, send "Please continue."
   - If no tool calls and no continuation needed, end the turn
5. **Iteration**: The process repeats until no more tool calls are needed

## Key Safety Mechanisms

1. **Max Turns Limit**: Prevents infinite loops with `MAX_TURNS = 100`
2. **Token Management**: Automatically compresses chat history when approaching token limits
3. **Error Handling**: Graceful handling of tool execution errors
4. **Abortion Support**: Proper cleanup when operations are cancelled
5. **Approval Modes**: Different levels of tool execution approval (YOLO, DEFAULT)

## Event-Driven Architecture

The system uses an event-driven approach with these key events:

- `GeminiEventType.Content`: Text content from the model
- `GeminiEventType.ToolCallRequest`: Model requests tool execution
- `GeminiEventType.ToolCallResponse`: Tool execution completed
- `GeminiEventType.ToolCallConfirmation`: Tool execution requires approval
- `GeminiEventType.Thought`: Model thinking process (for supported models)
- `GeminiEventType.Error`: Error occurred during processing

This architecture allows for flexible handling of different interaction modes (interactive UI, non-interactive CLI, streaming responses) while maintaining the core agent loop logic.