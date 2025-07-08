/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { spawn } from 'child_process';
import stripAnsi from 'strip-ansi';
import { HTBKnowledgeBaseTool } from './htb-knowledge-base.js';

export interface HTBScannerParams {
  command: string;
  description?: string;
  mode?: 'command' | 'web-analysis' | 'network-analysis';
  target?: string;
  analyzeType?: 'tech-detect' | 'endpoint-scan' | 'template-inject' | 'full-analysis';
}

export class HTBScannerTool extends BaseTool<HTBScannerParams, ToolResult> {
  static Name: string = 'htb_scanner';
  private whitelist: Set<string> = new Set();
  private knowledgeBaseTool: HTBKnowledgeBaseTool;

  constructor(private readonly config: Config) {
    super(
      HTBScannerTool.Name,
      'HTB Unified Scanner',
      `Unified HTB tool for command execution and specialized analysis for Hack The Box challenges and penetration testing.

**Modes:**
- **command**: Execute any bash command for pentesting tasks
- **web-analysis**: Specialized web application analysis (tech detection, endpoint scanning, template injection)
- **network-analysis**: Network service enumeration and analysis

**Command Mode Features:**
- Network scanning and enumeration
- Web application testing
- Password cracking and brute-forcing
- Exploitation and post-exploitation
- File system operations
- Tool installation and configuration

**Web Analysis Features:**
- Technology detection (frameworks, CMS, servers)
- Endpoint discovery (APIs, admin panels, hidden paths)
- Template injection testing (Jinja2, ERB, FreeMarker, etc.)
- Comprehensive web security assessment

The agent will automatically install missing tools using appropriate package managers when needed.

💡 Smart Integration: This tool automatically suggests relevant HackTricks techniques based on discovered services and vulnerabilities.`,
      {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The complete bash command to execute (required for command mode)',
          },
          description: {
            type: 'string',
            description: 'Brief description of what the command does',
          },
          mode: {
            type: 'string',
            enum: ['command', 'web-analysis', 'network-analysis'],
            description: 'Mode of operation (default: command)',
          },
          target: {
            type: 'string',
            description: 'Target URL or IP address (required for analysis modes)',
          },
          analyzeType: {
            type: 'string',
            enum: ['tech-detect', 'endpoint-scan', 'template-inject', 'full-analysis'],
            description: 'Type of analysis to perform (for web-analysis mode)',
          },
        },
        required: ['command'],
      },
      false, // output is not markdown
      true, // output can be updated
    );
    
    this.knowledgeBaseTool = new HTBKnowledgeBaseTool(config);
  }

  getDescription(params: HTBScannerParams): string {
    const mode = params.mode || 'command';
    
    switch (mode) {
      case 'web-analysis':
        return `HTB Web Analysis: ${params.analyzeType || 'full-analysis'} on ${params.target}`;
      case 'network-analysis':
        return `HTB Network Analysis: ${params.target}`;
      default:
        return params.description || `Execute: ${params.command}`;
    }
  }

  validateToolParams(params: HTBScannerParams): string | null {
    if (!SchemaValidator.validate(this.parameterSchema as Record<string, unknown>, params)) {
      return 'Parameters failed schema validation.';
    }

    const mode = params.mode || 'command';
    
    if (mode === 'command') {
      if (!params.command || params.command.trim() === '') {
        return 'Command cannot be empty for command mode.';
      }
    } else if (mode === 'web-analysis') {
      if (!params.target) {
        return 'Target URL is required for web analysis mode.';
      }
      if (!params.target.startsWith('http://') && !params.target.startsWith('https://')) {
        return 'Target must be a valid HTTP/HTTPS URL for web analysis.';
      }
    } else if (mode === 'network-analysis') {
      if (!params.target) {
        return 'Target IP or hostname is required for network analysis mode.';
      }
    }

    return null;
  }

  private buildWebAnalysisCommand(params: HTBScannerParams): string {
    const { target, analyzeType = 'full-analysis' } = params;

    switch (analyzeType) {
      case 'tech-detect':
        return `
          echo "=== Technology Detection for ${target} ===" &&
          echo -e "\\n[+] HTTP Headers Analysis:" &&
          curl -s -I "${target}" | grep -E "Server:|X-Powered-By:|X-Generator:|X-AspNet-Version:" &&
          echo -e "\\n[+] Common Files Check:" &&
          for file in robots.txt .htaccess composer.json package.json .git/config; do
            echo -n "Checking /$file: ";
            curl -s -o /dev/null -w "%{http_code}" "${target}/$file" | grep -q "200" && echo "FOUND" || echo "Not found";
          done
        `.trim();
      
      case 'endpoint-scan':
        return `
          echo "=== Endpoint Discovery for ${target} ===" &&
          tmpfile=$(mktemp) &&
          curl -s "${target}" > "$tmpfile" &&
          echo -e "\\n[+] HTML Form Actions:" &&
          grep -oP '(?<=action=")[^"]*' "$tmpfile" | sort -u &&
          echo -e "\\n[+] JavaScript URLs:" &&
          grep -oE '(https?://|/)[^"'\''\\s<>{}]+' "$tmpfile" | grep -E '\\.(js|json|api|php|asp|jsp)' | sort -u &&
          echo -e "\\n[+] API Endpoints:" &&
          grep -oE '["'\'']/(api|v[0-9])/[^"'\'']*["'\'']' "$tmpfile" | tr -d '"'\''' | sort -u &&
          echo -e "\\n[+] Hidden/Comment URLs:" &&
          grep -oE '<!--[^>]*-->' "$tmpfile" | grep -oE '(https?://|/)[^\\s<>]+' | sort -u &&
          rm -f "$tmpfile"
        `.trim();
      
      case 'template-inject':
        const payloads = [
          '{{7*7}}',
          '${7*7}',
          '<%= 7*7 %>',
          '#{7*7}',
          '*{7*7}',
        ];
        
        return `
          echo "=== Template Injection Testing for ${target} ===" &&
          ${payloads.map((p: string, idx: number) => `
            echo -e "\\n[+] Testing payload ${idx + 1}: ${p}" &&
            curl -s -X POST "${target}" -d "input=${encodeURIComponent(p)}" -H "Content-Type: application/x-www-form-urlencoded" | grep -C 2 -E "49|7\\*7|uid=|root|www-data" || echo "No direct indication of injection"
          `).join(' && ')}
        `.trim();
      
      case 'full-analysis':
        return `
          echo "=== Comprehensive Web Analysis for ${target} ===" &&
          ${this.buildWebAnalysisCommand({ ...params, analyzeType: 'tech-detect' })} &&
          echo -e "\\n\\n" &&
          ${this.buildWebAnalysisCommand({ ...params, analyzeType: 'endpoint-scan' })} &&
          echo -e "\\n\\n" &&
          ${this.buildWebAnalysisCommand({ ...params, analyzeType: 'template-inject' })}
        `.trim();
      
      default:
        throw new Error(`Unknown analyze type: ${analyzeType}`);
    }
  }

  private buildNetworkAnalysisCommand(target: string): string {
    return `
      echo "=== Network Analysis for ${target} ===" &&
      echo -e "\\n[+] Basic Port Scan:" &&
      nmap -sV -sC -oN nmap_initial.txt "${target}" &&
      echo -e "\\n[+] Service Detection:" &&
      nmap -sV -A "${target}" | grep -E "(open|filtered)" &&
      echo -e "\\n[+] OS Detection:" &&
      nmap -O "${target}" | grep -E "(OS|Running|Aggressive)" &&
      echo -e "\\n[+] Vulnerability Scan:" &&
      nmap --script vuln "${target}" | grep -E "(VULNERABLE|CVE|exploit)"
    `.trim();
  }

  private analyzeForKnowledgeBaseSuggestions(command: string, output: string, mode: string = 'command'): string[] {
    const suggestions: string[] = [];
    const commandLower = command.toLowerCase();
    const outputLower = output.toLowerCase();
    
    // Web analysis mode suggestions
    if (mode === 'web-analysis') {
      if (outputLower.includes('apache')) {
        suggestions.push('Apache web server security');
      }
      if (outputLower.includes('nginx')) {
        suggestions.push('Nginx web server security');
      }
      if (outputLower.includes('php')) {
        suggestions.push('PHP web application security');
      }
      if (outputLower.includes('wordpress')) {
        suggestions.push('WordPress security');
      }
      if (outputLower.includes('admin') || outputLower.includes('login')) {
        suggestions.push('login bypass techniques');
      }
      if (outputLower.includes('upload') || outputLower.includes('file')) {
        suggestions.push('file upload vulnerabilities');
      }
      if (outputLower.includes('api')) {
        suggestions.push('API security testing');
      }
      if (outputLower.includes('49') || outputLower.includes('7*7')) {
        suggestions.push('server side template injection');
      }
      return [...new Set(suggestions)];
    }
    
    // Network analysis mode suggestions
    if (mode === 'network-analysis') {
      if (outputLower.includes('open') || outputLower.includes('filtered')) {
        suggestions.push('open port exploitation');
      }
      if (outputLower.includes('ssh')) {
        suggestions.push('SSH pentesting');
      }
      if (outputLower.includes('http') || outputLower.includes('web')) {
        suggestions.push('HTTP web pentesting');
      }
      if (outputLower.includes('smb')) {
        suggestions.push('SMB pentesting');
      }
      if (outputLower.includes('ftp')) {
        suggestions.push('FTP pentesting');
      }
      if (outputLower.includes('vulnerable') || outputLower.includes('cve')) {
        suggestions.push('vulnerability exploitation');
      }
      return [...new Set(suggestions)];
    }
    
    // Port scanning patterns (for command mode)
    if (commandLower.includes('nmap') || commandLower.includes('masscan')) {
      // Look for common services in output
      const servicePatterns = [
        { pattern: /port\s+22.*ssh/i, query: 'SSH pentesting' },
        { pattern: /port\s+80.*http/i, query: 'HTTP web pentesting' },
        { pattern: /port\s+443.*https/i, query: 'HTTPS web pentesting' },
        { pattern: /port\s+21.*ftp/i, query: 'FTP pentesting' },
        { pattern: /port\s+23.*telnet/i, query: 'Telnet pentesting' },
        { pattern: /port\s+25.*smtp/i, query: 'SMTP pentesting' },
        { pattern: /port\s+53.*dns/i, query: 'DNS pentesting' },
        { pattern: /port\s+110.*pop3/i, query: 'POP3 pentesting' },
        { pattern: /port\s+143.*imap/i, query: 'IMAP pentesting' },
        { pattern: /port\s+135.*msrpc/i, query: 'MSRPC pentesting' },
        { pattern: /port\s+139.*netbios/i, query: 'NetBIOS pentesting' },
        { pattern: /port\s+445.*smb/i, query: 'SMB pentesting' },
        { pattern: /port\s+1433.*sql/i, query: 'MSSQL pentesting' },
        { pattern: /port\s+3306.*mysql/i, query: 'MySQL pentesting' },
        { pattern: /port\s+5432.*postgresql/i, query: 'PostgreSQL pentesting' },
        { pattern: /port\s+6379.*redis/i, query: 'Redis pentesting' },
        { pattern: /port\s+27017.*mongodb/i, query: 'MongoDB pentesting' },
        { pattern: /port\s+3389.*rdp/i, query: 'RDP pentesting' },
        { pattern: /port\s+5985.*winrm/i, query: 'WinRM pentesting' },
        { pattern: /port\s+88.*kerberos/i, query: 'Kerberos pentesting' },
        { pattern: /port\s+389.*ldap/i, query: 'LDAP pentesting' },
        { pattern: /port\s+161.*snmp/i, query: 'SNMP pentesting' },
      ];
      
      for (const { pattern, query } of servicePatterns) {
        if (pattern.test(output)) {
          suggestions.push(query);
        }
      }
    }
    
    // Web application testing patterns
    if (commandLower.includes('gobuster') || commandLower.includes('dirb') || commandLower.includes('dirbuster')) {
      suggestions.push('directory enumeration techniques');
      if (outputLower.includes('admin') || outputLower.includes('login')) {
        suggestions.push('login bypass techniques');
      }
      if (outputLower.includes('upload') || outputLower.includes('file')) {
        suggestions.push('file upload vulnerabilities');
      }
    }
    
    // SQLMap patterns
    if (commandLower.includes('sqlmap')) {
      suggestions.push('SQL injection techniques');
      if (outputLower.includes('union')) {
        suggestions.push('SQL injection UNION attacks');
      }
      if (outputLower.includes('blind')) {
        suggestions.push('blind SQL injection');
      }
    }
    
    // Vulnerability scanning patterns
    if (commandLower.includes('nikto') || commandLower.includes('nuclei')) {
      suggestions.push('web vulnerabilities');
      if (outputLower.includes('xss')) {
        suggestions.push('XSS cross site scripting');
      }
      if (outputLower.includes('sqli')) {
        suggestions.push('SQL injection');
      }
      if (outputLower.includes('lfi')) {
        suggestions.push('local file inclusion');
      }
      if (outputLower.includes('rfi')) {
        suggestions.push('remote file inclusion');
      }
    }
    
    // Brute force patterns
    if (commandLower.includes('hydra') || commandLower.includes('medusa') || commandLower.includes('ncrack')) {
      suggestions.push('password brute forcing');
      if (commandLower.includes('ssh')) {
        suggestions.push('SSH brute force');
      }
      if (commandLower.includes('ftp')) {
        suggestions.push('FTP brute force');
      }
      if (commandLower.includes('smb')) {
        suggestions.push('SMB brute force');
      }
    }
    
    // Exploitation patterns
    if (commandLower.includes('searchsploit') || commandLower.includes('exploit')) {
      suggestions.push('exploitation techniques');
      if (outputLower.includes('buffer overflow')) {
        suggestions.push('buffer overflow exploitation');
      }
      if (outputLower.includes('privilege escalation')) {
        suggestions.push('privilege escalation');
      }
    }
    
    // Remove duplicates and return
    return [...new Set(suggestions)];
  }
  
  private async generateKnowledgeBaseSuggestions(suggestions: string[]): Promise<string> {
    if (suggestions.length === 0) {
      return '';
    }
    
    let suggestionText = '\n\n🔍 **HackTricks Knowledge Base Suggestions:**\n\n';
    suggestionText += 'Based on your command and results, you might want to explore these techniques:\n\n';
    
    for (const suggestion of suggestions.slice(0, 3)) { // Limit to top 3 suggestions
      suggestionText += `• **${suggestion}** - Try: \`htb_knowledge_base("${suggestion}")\`\n`;
    }
    
    if (suggestions.length > 3) {
      suggestionText += `\n_And ${suggestions.length - 3} more techniques available in the knowledge base._`;
    }
    
    return suggestionText;
  }

  async shouldConfirmExecute(
    params: HTBScannerParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.validateToolParams(params)) {
      return false; // skip confirmation, execute call will fail immediately
    }
    
    // Extract the base command for whitelisting
    const baseCommand = params.command.split(' ')[0];
    
    if (this.whitelist.has(baseCommand)) {
      return false; // already approved and whitelisted
    }

    return {
      type: 'exec',
      title: `Confirm Command Execution`,
      command: params.command,
      rootCommand: baseCommand,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.whitelist.add(baseCommand);
        }
      },
    };
  }

  async execute(
    params: HTBScannerParams,
    abortSignal: AbortSignal,
    updateOutput?: (chunk: string) => void,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `HTB Scanner rejected: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: 'HTB Scanner was cancelled by user before it could start.',
        returnDisplay: 'Scanner cancelled by user.',
      };
    }

    // Build command based on mode
    const mode = params.mode || 'command';
    let command: string;
    
    switch (mode) {
      case 'web-analysis':
        command = this.buildWebAnalysisCommand(params);
        break;
      case 'network-analysis':
        command = this.buildNetworkAnalysisCommand(params.target!);
        break;
      default:
        command = params.command;
    }

    const shell = spawn('bash', ['-c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this.config.getTargetDir(),
    });

    let exited = false;
    let stdout = '';
    let stderr = '';
    let lastUpdateTime = Date.now();

    const OUTPUT_UPDATE_INTERVAL_MS = 1000;

    const appendOutput = (str: string) => {
      if (updateOutput && Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
        updateOutput(stdout + stderr);
        lastUpdateTime = Date.now();
      }
    };

    shell.stdout.on('data', (data: Buffer) => {
      if (!exited) {
        const str = stripAnsi(data.toString());
        stdout += str;
        appendOutput(str);
      }
    });

    shell.stderr.on('data', (data: Buffer) => {
      if (!exited) {
        const str = stripAnsi(data.toString());
        stderr += str;
        appendOutput(str);
      }
    });

    let error: string | null = null;
    shell.on('error', (err: Error) => {
      error = err.message;
    });

    let code: number | null = null;
    let processSignal: NodeJS.Signals | null = null;
    shell.on('exit', (_code: number | null, _signal: NodeJS.Signals | null) => {
      exited = true;
      code = _code;
      processSignal = _signal;
    });

    const abortHandler = () => {
      if (shell.pid && !exited) {
        try {
          process.kill(-shell.pid, 'SIGTERM');
        } catch (_e) {
          shell.kill('SIGKILL');
        }
      }
    };
    abortSignal.addEventListener('abort', abortHandler);

    // Wait for the shell to exit
    try {
      await new Promise((resolve) => shell.on('exit', resolve));
    } finally {
      abortSignal.removeEventListener('abort', abortHandler);
    }

    let llmContent = '';
    if (abortSignal.aborted) {
      llmContent = 'HTB Scanner was cancelled by user before it could complete.';
      if (stdout.trim() || stderr.trim()) {
        llmContent += ` Below is the output before it was cancelled:\n${stdout}${stderr}`;
      }
    } else {
      const mode = params.mode || 'command';
      llmContent = [
        `HTB Scanner Mode: ${mode}`,
        `Command: ${command}`,
        `Description: ${params.description || 'None provided'}`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Exit Code: ${code ?? '(none)'}`,
      ].join('\n');
    }

    let returnDisplayMessage = '';
    if (stdout.trim() || stderr.trim()) {
      returnDisplayMessage = stdout + stderr;
    } else if (abortSignal.aborted) {
      returnDisplayMessage = 'Command cancelled by user.';
    } else if (error) {
      returnDisplayMessage = `Command failed: ${error}`;
    } else if (code !== null && code !== 0) {
      returnDisplayMessage = `Command exited with code: ${code}`;
    }

    // Add knowledge base suggestions if command was successful
    if (code === 0 && !abortSignal.aborted && !error && stdout.trim()) {
      const mode = params.mode || 'command';
      const suggestions = this.analyzeForKnowledgeBaseSuggestions(command, stdout, mode);
      const suggestionText = await this.generateKnowledgeBaseSuggestions(suggestions);
      if (suggestionText) {
        returnDisplayMessage += suggestionText;
        llmContent += suggestionText;
      }
    }

    return { llmContent, returnDisplay: returnDisplayMessage };
  }
}

// Helper function to encode URI components for web analysis
function encodeURIComponent(str: string): string {
  return str.replace(/[!'()*]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
} 