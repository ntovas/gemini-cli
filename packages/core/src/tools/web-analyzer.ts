/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolInfoConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { convert } from 'html-to-text';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';

const URL_FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 100000;

export interface WebAnalyzerToolParams {
  target_url: string;
  objective?: string;
}

export class WebAnalyzerTool extends BaseTool<WebAnalyzerToolParams, ToolResult> {
  static readonly Name = 'web_analyzer';

  constructor(private readonly config: Config) {
    super(
      WebAnalyzerTool.Name,
      'Web Analyzer',
      'A tool for analyzing web content. It fetches content from a URL and uses an LLM to analyze it for potential vulnerabilities, next steps, or interesting endpoints based on a given objective.',
      {
        type: 'object',
        properties: {
          target_url: {
            type: 'string',
            description:
              'The URL of the target to analyze (e.g., "http://10.10.10.1/index.html").',
          },
          objective: {
            type: 'string',
            description:
              'Optional: Specific objective for the analysis (e.g., "find login forms", "look for API endpoints", "check for common web vulnerabilities").',
          },
        },
        required: ['target_url'],
      },
    );
  }

  validateToolParams(params: WebAnalyzerToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }
    if (!params.target_url || !params.target_url.trim().startsWith('http')) {
      return 'The "target_url" parameter must be a valid URL starting with http:// or https://.';
    }
    return null;
  }

  getDescription(params: WebAnalyzerToolParams): string {
    const { target_url, objective } = params;
    let desc = `Analyzing ${target_url}`;
    if (objective) {
      desc += ` for objective: "${objective}"`;
    }
    return desc;
  }

  async shouldConfirmExecute(
    params: WebAnalyzerToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    const confirmationDetails: ToolInfoConfirmationDetails = {
      type: 'info',
      title: 'Confirm Target Analysis',
      prompt: `This tool will fetch content from ${params.target_url} and send it to an LLM for security analysis.`,
      urls: [params.target_url],
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: WebAnalyzerToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const { target_url, objective } = params;

    let fetchedContent: string;
    try {
      const response = await fetchWithTimeout(target_url, URL_FETCH_TIMEOUT_MS);
      if (!response.ok) {
        throw new Error(
          `Request failed with status code ${response.status} ${response.statusText}`,
        );
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const html = await response.text();
        fetchedContent = convert(html, {
          wordwrap: false,
          selectors: [
            { selector: 'a', options: { ignoreHref: false } }, // Keep links
            {
              selector: 'form',
              options: {
                itemPrefix: '[FORM] ',
              },
            },
            {
              selector: 'input',
              options: {
                itemPrefix: '[INPUT] ',
              },
            },
            { selector: 'script', format: 'skip' }, // Skip script content by default
            { selector: 'style', format: 'skip' },
          ],
        }).substring(0, MAX_CONTENT_LENGTH);
      } else if (contentType.includes('application/json')) {
        const json = await response.json();
        fetchedContent = JSON.stringify(json, null, 2).substring(
          0,
          MAX_CONTENT_LENGTH,
        );
      } else {
        fetchedContent = (await response.text()).substring(
          0,
          MAX_CONTENT_LENGTH,
        );
      }
    } catch (e) {
      const error = e as Error;
      const errorMessage = `Error fetching content from ${target_url}: ${error.message}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }

    const geminiClient = this.config.getGeminiClient();
    const analysisPrompt = `
I am performing a web analysis on a target. I have fetched the content from the URL "${target_url}".
My current objective is: "${objective || 'Perform initial analysis. Identify potential attack vectors, interesting endpoints, forms, and technologies used.'}"

Here is the content I retrieved:
---
${fetchedContent}
---

Based on the content and my objective, please provide a concise analysis.
Focus on actionable intelligence for web analysis.
What are the most promising next steps?
Identify any forms, API endpoints, potential vulnerabilities (like outdated software versions, exposed comments, etc.), and other interesting links or files.
Present your findings clearly.
`;

    try {
      const result = await geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: analysisPrompt }] }],
        {},
        signal,
      );
      const resultText =
        getResponseText(result) || 'No analysis returned from the model.';
      return {
        llmContent: resultText,
        returnDisplay: `Analysis for ${target_url} complete.`,
      };
    } catch (e) {
      const error = e as Error;
      const errorMessage = `Error during LLM analysis for ${target_url}: ${getErrorMessage(error)}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }
}
