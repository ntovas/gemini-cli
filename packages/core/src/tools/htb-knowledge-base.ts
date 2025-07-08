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
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import Database from 'better-sqlite3';
import { Ollama } from 'ollama';

type DatabaseInstance = ReturnType<typeof Database>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HTBKnowledgeBaseParams {
  query: string;
  category?: 'web' | 'network' | 'all';
  limit?: number;
}

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  filePath: string;
  category: 'web' | 'network';
  summary: string;
  embedding?: number[];
}

interface VectorSearchResult {
  entry: KnowledgeEntry;
  similarity: number;
}

interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  dimensions: number;
}

// Gemini Embedding Provider
class GeminiEmbeddingProvider implements EmbeddingProvider {
  private genAI: GoogleGenAI;
  public dimensions = 768; // text-embedding-004 dimension

  constructor(config?: Config) {
    const apiKey = process.env.GEMINI_API_KEY;
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.genAI.models.embedContent({
        model: 'text-embedding-004',
        contents: [{ text }], // Fixed: use 'contents' array with text object
      });
      
      if (response.embeddings && response.embeddings.length > 0 && response.embeddings[0].values) {
        return response.embeddings[0].values;
      }
      throw new Error('No embedding values in response');
    } catch (error) {
      console.error('Gemini embedding error:', error);
      throw error;
    }
  }
}

// Ollama Embedding Provider
class OllamaEmbeddingProvider implements EmbeddingProvider {
  private ollama: Ollama;
  private modelName: string;
  public dimensions: number;

  constructor(modelName: string = 'nomic-embed-text', dimensions: number = 768) {
    this.ollama = new Ollama();
    this.modelName = modelName;
    this.dimensions = dimensions;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.ollama.embeddings({
        model: this.modelName,
        prompt: text,
      });
      
      if (response.embedding) {
        return response.embedding;
      }
      throw new Error('No embedding in response');
    } catch (error) {
      console.error('Ollama embedding error:', error);
      throw error;
    }
  }
}

// Vector search utilities
class VectorSearch {
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  static searchSimilar(
    queryEmbedding: number[],
    entries: KnowledgeEntry[],
    limit: number = 5,
    category?: 'web' | 'network'
  ): VectorSearchResult[] {
    const filteredEntries = category 
      ? entries.filter(entry => entry.category === category)
      : entries;

    const results = filteredEntries
      .filter(entry => entry.embedding)
      .map(entry => ({
        entry,
        similarity: this.cosineSimilarity(queryEmbedding, entry.embedding!)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }
}

export class HTBKnowledgeBaseTool extends BaseTool<HTBKnowledgeBaseParams, ToolResult> {
  static Name: string = 'htb_knowledge_base';
  private db: DatabaseInstance | null = null;
  private dbPath: string;
  private vectorDataPath: string;
  private hacktricksDbPath: string;
  private knowledgeEntries: KnowledgeEntry[] = [];
  private isInitialized = false;
  private embeddingProvider: EmbeddingProvider;

  constructor(private readonly config: Config) {
    super(
      HTBKnowledgeBaseTool.Name,
      'HTB Knowledge Base',
      `Query the HackTricks knowledge base for pentesting techniques and attack vectors using vector similarity search.

This tool provides access to a comprehensive database of pentesting methodologies from HackTricks, including:
- Web application attack techniques
- Network service pentesting methods
- Common vulnerabilities and exploits
- Service-specific attack vectors
- Bypass techniques and payloads

The knowledge base uses vector embeddings for semantic search, allowing you to find relevant techniques even when using different terminology.`,
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What you want to learn about (e.g., "SQL injection", "SMB enumeration", "XSS bypass")',
          },
          category: {
            type: 'string',
            enum: ['web', 'network', 'all'],
            description: 'Filter by category (default: all)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
          },
        },
        required: ['query'],
      },
      true, // output is markdown
      false, // output cannot be updated
    );
    
    // Get the project root directory
    const projectRoot = path.resolve(__dirname, '../../../../..');
    this.hacktricksDbPath = path.join(projectRoot, 'hacktricks-db');
    this.dbPath = path.join(projectRoot, 'htb-knowledge.db');
    this.vectorDataPath = path.join(projectRoot, 'htb-vectors.json');
    
    // Initialize embedding provider based on environment variable or default to Gemini
    const embeddingModel = process.env.HTB_EMBEDDING_MODEL || 'gemini';
    if (embeddingModel === 'ollama') {
      const ollamaModel = process.env.HTB_OLLAMA_MODEL || 'nomic-embed-text';
      const dimensions = parseInt(process.env.HTB_EMBEDDING_DIMENSIONS || '768', 10);
      this.embeddingProvider = new OllamaEmbeddingProvider(ollamaModel, dimensions);
    } else {
      this.embeddingProvider = new GeminiEmbeddingProvider(this.config);
    }
  }

  getDescription(params: HTBKnowledgeBaseParams): string {
    return `Query HTB knowledge base for: ${params.query}`;
  }

  validateToolParams(params: HTBKnowledgeBaseParams): string | null {
    if (!SchemaValidator.validate(this.parameterSchema as Record<string, unknown>, params)) {
      return 'Parameters failed schema validation.';
    }

    if (!params.query || params.query.trim() === '') {
      return 'Query cannot be empty.';
    }

    return null;
  }

  async shouldConfirmExecute(
    params: HTBKnowledgeBaseParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false; // No confirmation needed for knowledge base queries
  }

  private async initializeDatabase(): Promise<void> {
    if (this.db) return;

    console.log('Initializing HTB knowledge database...');
    
    // Create or open the database for document metadata
    this.db = new Database(this.dbPath);

    // Create tables for document metadata (no vectors in SQLite)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        file_path TEXT NOT NULL,
        category TEXT NOT NULL,
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_documents_doc_id ON documents(doc_id);
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
    `);

    console.log('Database initialized successfully');
  }

  private async loadVectorData(): Promise<void> {
    if (fs.existsSync(this.vectorDataPath)) {
      console.log('Loading existing vector data...');
      const data = fs.readFileSync(this.vectorDataPath, 'utf8');
      this.knowledgeEntries = JSON.parse(data);
      console.log(`Loaded ${this.knowledgeEntries.length} entries with embeddings`);
    }
  }

  private async saveVectorData(): Promise<void> {
    console.log('Saving vector data...');
    fs.writeFileSync(this.vectorDataPath, JSON.stringify(this.knowledgeEntries, null, 2));
    console.log('Vector data saved successfully');
  }

  private async initializeKnowledgeBase(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.initializeDatabase();
      await this.loadVectorData();
      
      // Check if we need to rebuild the database
      const needsRebuild = await this.checkNeedsRebuild();
      
      if (needsRebuild) {
        console.log('Rebuilding HTB knowledge base...');
        await this.rebuildKnowledgeBase();
      } else {
        console.log('HTB knowledge base is up to date');
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize HTB knowledge base:', error);
      throw error;
    }
  }

  private async checkNeedsRebuild(): Promise<boolean> {
    if (!this.db) return true;
    
    // Check if database is empty
    const count = this.db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    if (count.count === 0) {
      return true;
    }
    
    // Check if vector data exists
    if (!fs.existsSync(this.vectorDataPath) || this.knowledgeEntries.length === 0) {
      return true;
    }
    
    return false;
  }

  private async rebuildKnowledgeBase(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Clear existing data
    this.db.exec('DELETE FROM documents');
    this.knowledgeEntries = [];
    
    // Process web pentesting files
    const webPath = path.join(this.hacktricksDbPath, 'pentesting-web');
    if (fs.existsSync(webPath)) {
      await this.processDirectory(webPath, 'web', this.knowledgeEntries);
    }
    
    // Process network services files
    const networkPath = path.join(this.hacktricksDbPath, 'network-services-pentesting');
    if (fs.existsSync(networkPath)) {
      await this.processDirectory(networkPath, 'network', this.knowledgeEntries);
    }
    
    console.log(`Loaded ${this.knowledgeEntries.length} knowledge entries`);
    
    // Store entries in database and generate embeddings
    await this.storeEntriesWithEmbeddings();
  }

  private async processDirectory(dirPath: string, category: 'web' | 'network', entries: KnowledgeEntry[]): Promise<void> {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        await this.processDirectory(fullPath, category, entries);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const title = this.extractTitle(content, item.name);
          const summary = this.extractSummary(content);
          
          entries.push({
            id: this.generateId(fullPath),
            title,
            content,
            filePath: fullPath,
            category,
            summary,
          });
        } catch (error) {
          console.error(`Error processing file ${fullPath}:`, error);
        }
      }
    }
  }

  private async storeEntriesWithEmbeddings(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    console.log('Generating and storing embeddings...');
    
    const batchSize = 10;
    const insertDoc = this.db.prepare(`
      INSERT INTO documents (doc_id, title, content, file_path, category, summary)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < this.knowledgeEntries.length; i += batchSize) {
      const batch = this.knowledgeEntries.slice(i, i + batchSize);
      
      // Generate embeddings for the batch
      for (const entry of batch) {
        try {
          // Create embedding text
          const embeddingText = `${entry.title}\n\n${entry.summary}\n\n${entry.content.substring(0, 1000)}`;
          
          // Generate embedding
          const embedding = await this.embeddingProvider.generateEmbedding(embeddingText);
          entry.embedding = embedding;
          
          // Store document metadata in SQLite
          insertDoc.run(
            entry.id,
            entry.title,
            entry.content,
            entry.filePath,
            entry.category,
            entry.summary
          );
          
          console.log(`Processed ${entry.title} (${entry.category})`);
        } catch (error) {
          console.error(`Error processing entry ${entry.id}:`, error);
        }
      }
      
      console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(this.knowledgeEntries.length / batchSize)}`);
    }
    
    // Save vector data to JSON file
    await this.saveVectorData();
    console.log('Embeddings stored successfully');
  }

  private generateId(filePath: string): string {
    return Buffer.from(filePath).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  }

  private extractTitle(content: string, filename: string): string {
    // Try to extract title from first H1 header
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }
    
    // Fall back to filename without extension
    return filename.replace(/\.md$/, '').replace(/-/g, ' ');
  }

  private extractSummary(content: string): string {
    // Extract first paragraph or first few sentences
    const paragraphs = content.split('\n\n').filter(p => p.trim() && !p.startsWith('#'));
    if (paragraphs.length > 0) {
      const firstParagraph = paragraphs[0].trim();
      if (firstParagraph.length > 200) {
        return firstParagraph.substring(0, 200) + '...';
      }
      return firstParagraph;
    }
    return '';
  }

  private async queryKnowledgeBase(query: string, category: 'web' | 'network' | 'all' = 'all', limit: number = 5): Promise<VectorSearchResult[]> {
    // Generate embedding for the query
    const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
    
    // Use vector search to find similar entries
    const results = VectorSearch.searchSimilar(
      queryEmbedding,
      this.knowledgeEntries,
      limit,
      category === 'all' ? undefined : category
    );
    
    return results;
  }

  private formatResults(results: VectorSearchResult[], query: string): string {
    if (results.length === 0) {
      return `No results found for "${query}". Try broader search terms or check the available categories.`;
    }

    let output = `# HTB Knowledge Base Results for "${query}"\n\n`;
    output += `Found ${results.length} relevant technique(s):\n\n`;

    for (let i = 0; i < results.length; i++) {
      const { entry, similarity } = results[i];
      const categoryTag = entry.category === 'web' ? '🌐 Web' : '🔗 Network';
      const similarityPercent = Math.round(similarity * 100);
      
      output += `## ${i + 1}. ${entry.title} (${categoryTag}) - ${similarityPercent}% match\n\n`;
      
      if (entry.summary) {
        output += `**Summary:** ${entry.summary}\n\n`;
      }
      
      // Extract key sections from the document
      const sections = entry.content.split('\n\n');
      let excerpt = '';
      let charCount = 0;
      const maxChars = 600;
      
      for (const section of sections) {
        if (charCount + section.length > maxChars) {
          break;
        }
        if (section.trim() && !section.startsWith('#')) {
          excerpt += section.trim() + '\n\n';
          charCount += section.length;
        }
      }
      
      if (excerpt.length > maxChars) {
        excerpt = excerpt.substring(0, maxChars) + '...';
      }
      
      output += excerpt;
      output += `\n**Source:** \`${path.basename(entry.filePath)}\`\n\n`;
      output += '---\n\n';
    }

    return output;
  }

  async execute(
    params: HTBKnowledgeBaseParams,
    abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Knowledge base query rejected: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: 'Knowledge base query was cancelled.',
        returnDisplay: 'Query cancelled.',
      };
    }

    try {
      await this.initializeKnowledgeBase();
      
      const category = params.category || 'all';
      const limit = params.limit || 5;
      const results = await this.queryKnowledgeBase(params.query, category, limit);
      
      const formatted = this.formatResults(results, params.query);
      
      return {
        llmContent: formatted,
        returnDisplay: formatted,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        llmContent: `Error querying knowledge base: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
  
  // Cleanup method
  cleanup(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
} 