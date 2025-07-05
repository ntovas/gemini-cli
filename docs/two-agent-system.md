# Two-Agent System Documentation

## Overview

The Gemini CLI now supports a two-agent architecture that separates thinking/planning from tool execution for improved specialization and performance.

## Architecture

### Main Agent
- **Model**: `gemini-2.5-pro` (DEFAULT_GEMINI_MODEL)
- **Role**: Thinking, planning, and user interaction
- **Capabilities**:
  - User interaction and communication
  - Strategic planning and analysis
  - Code analysis and understanding
  - Problem decomposition
  - Response generation and synthesis
  - Conversation management

**Restrictions**:
- Cannot execute tools directly
- Must delegate all tool operations to the Tools Agent
- Cannot access file system or run commands

### Tools Agent
- **Model**: `gemini-2.5-flash-lite-preview-06-17` (DEFAULT_GEMINI_TOOL_MODEL)
- **Role**: Tool execution and operational tasks
- **Capabilities**:
  - File system operations (read, write, edit)
  - Shell command execution
  - Code editing and manipulation
  - Search and grep operations
  - Web operations and fetching
  - Tool orchestration

**Restrictions**:
- Limited reasoning capabilities
- Cannot make strategic decisions independently
- Must follow explicit instructions from Main Agent
- Cannot interact with users directly

## Agent-to-Agent Communication

The agents communicate through a message-based system (A2A - Agent-to-Agent) with the following message types:

- `TOOL_EXECUTION_REQUEST`: Main Agent requests tool execution
- `TOOL_EXECUTION_RESPONSE`: Tools Agent responds with results
- `PLANNING_REQUEST`: Tools Agent requests guidance
- `PLANNING_RESPONSE`: Main Agent provides strategic direction
- `STATUS_UPDATE`: Progress and status information
- `ERROR`: Error handling and reporting

## Configuration

### Environment Variables

```bash
# Enable/disable two-agent mode
export GEMINI_TWO_AGENT_MODE=true

# Custom models (optional)
export GEMINI_MAIN_AGENT_MODEL="gemini-2.5-pro"
export GEMINI_TOOL_AGENT_MODEL="gemini-2.5-flash-lite-preview-06-17"
```

### Programmatic Configuration

```typescript
import { createTwoAgentSystem, TwoAgentSystemConfig } from '@google/gemini-cli-core';

const config: TwoAgentSystemConfig = {
  enabled: true,
  mainAgentModel: 'gemini-2.5-pro',
  toolsAgentModel: 'gemini-2.5-flash-lite-preview-06-17',
  sessionId: 'my-session',
  debugMode: true,
};

const twoAgentSystem = new TwoAgentSystem(coreConfig, config);
await twoAgentSystem.initialize();
```

## Usage Examples

### Basic User Interaction

```typescript
import { createTwoAgentSystem } from '@google/gemini-cli-core';

// Initialize the system
const agentSystem = await createTwoAgentSystem(config);

// Handle user input
const response = await agentSystem.handleUserInput("Please read the README.md file and summarize it");

console.log(response);
```

### Direct Tool Execution

```typescript
// Execute tools directly through the Tools Agent
const toolCalls = [
  {
    callId: 'read-1',
    name: 'read_file',
    args: { path: '/path/to/file.txt' }
  }
];

const results = await agentSystem.executeTools(toolCalls);
```

### Monitoring and Debugging

```typescript
// Get communication statistics
const stats = agentSystem.getStats();
console.log(`Messages exchanged: ${stats?.totalMessages}`);

// Get message history for debugging
const history = agentSystem.getMessageHistory();
console.log('Agent communication history:', history);

// Get system status
const status = agentSystem.getSystemStatus();
console.log('System status:', status);
```

## Benefits

### Improved Specialization
- Main Agent optimized for reasoning and planning
- Tools Agent optimized for execution and operations
- Clear separation of concerns

### Better Performance
- Lightweight tool model for fast execution
- Powerful main model for complex reasoning
- Reduced context switching

### Enhanced Safety
- Tools Agent operates with restricted reasoning
- Main Agent provides oversight and validation
- Clear audit trail of all operations

### Scalability
- Independent scaling of reasoning vs execution
- Modular architecture for future enhancements
- Easy to add specialized agents

## Workflow Example

1. **User Input**: "Fix the bug in src/utils.ts"

2. **Main Agent Analysis**:
   - Analyzes the request
   - Plans the approach
   - Identifies needed tools

3. **Tool Delegation**:
   - Main Agent sends tool execution request
   - Tools Agent receives request and executes:
     - Read src/utils.ts
     - Analyze code for bugs
     - Apply fixes
     - Run tests

4. **Result Synthesis**:
   - Tools Agent returns results
   - Main Agent synthesizes final response
   - User receives comprehensive update

## Migration from Single-Agent

The two-agent system is backward compatible. Existing code will continue to work, but you can opt-in to the new system by:

1. Setting `GEMINI_TWO_AGENT_MODE=true`
2. Using the new TwoAgentSystem class
3. Updating tool calling patterns if needed

## Troubleshooting

### Debug Mode
Enable debug mode to see detailed agent communication:

```typescript
agentSystem.enableDebugMode();
```

### Message History
Review agent communication for issues:

```typescript
const history = agentSystem.getMessageHistory();
history.forEach(msg => {
  console.log(`${msg.fromAgent} -> ${msg.toAgent}: ${msg.type}`);
});
```

### System Status
Check overall system health:

```typescript
const status = agentSystem.getSystemStatus();
if (!status.enabled) {
  console.log('Two-agent system is disabled');
}
```

## Future Enhancements

- Additional specialized agents (e.g., web agent, database agent)
- Advanced routing and load balancing
- Cross-session agent memory
- Agent performance metrics
- Custom agent configurations
