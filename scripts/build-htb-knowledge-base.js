#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { HTBKnowledgeBaseTool, Config } from '../packages/core/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Command-line argument parsing
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(`
HTB Knowledge Base Builder

Usage:
  node build-htb-knowledge-base.js <command> [options]

Commands:
  build    - Build the embeddings database from HackTricks markdown files
  query    - Query the knowledge base (requires --query parameter)
  info     - Display database statistics

Options:
  --model <provider>  - Embedding provider: 'gemini' or 'ollama' (default: 'gemini')
  --ollama-model      - Ollama model name (default: 'nomic-embed-text')
  --query <text>      - Query text for search
  --limit <number>    - Maximum results to return (default: 5)
  --category <type>   - Filter by category: 'web', 'network', or 'all' (default: 'all')

Environment Variables:
  HTB_EMBEDDING_MODEL     - Set to 'ollama' to use Ollama instead of Gemini
  HTB_OLLAMA_MODEL        - Ollama model name (default: 'nomic-embed-text')
  HTB_EMBEDDING_DIMENSIONS - Embedding dimensions (default: 768)

Examples:
  # Build database using Gemini embeddings
  node build-htb-knowledge-base.js build

  # Build database using Ollama
  HTB_EMBEDDING_MODEL=ollama node build-htb-knowledge-base.js build

  # Query the database
  node build-htb-knowledge-base.js query --query "SQL injection bypass"

  # Query with filters
  node build-htb-knowledge-base.js query --query "XSS" --category web --limit 10
`);
  process.exit(0);
}

// Parse command-line options
function parseArgs(args) {
  const options = {
    model: process.env.HTB_EMBEDDING_MODEL || 'gemini',
    ollamaModel: process.env.HTB_OLLAMA_MODEL || 'nomic-embed-text',
    query: '',
    limit: 5,
    category: 'all'
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
        options.model = args[++i];
        break;
      case '--ollama-model':
        options.ollamaModel = args[++i];
        break;
      case '--query':
        options.query = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--category':
        options.category = args[++i];
        break;
    }
  }

  return options;
}

// Create a minimal config for the HTB knowledge base tool
function createConfig() {
  return new Config({
    sessionId: 'htb-builder-' + Date.now(),
    targetDir: projectRoot,
    debugMode: false,
    cwd: projectRoot,
    model: 'gemini-1.5-pro',
  });
}

// Force rebuild the database
async function buildDatabase() {
  console.log('Building HTB Knowledge Base...');
  
  // Set environment variables if needed
  const options = parseArgs(args);
  if (options.model === 'ollama') {
    process.env.HTB_EMBEDDING_MODEL = 'ollama';
    process.env.HTB_OLLAMA_MODEL = options.ollamaModel;
  }

  const config = createConfig();
  const tool = new HTBKnowledgeBaseTool(config);
  
  // Access the private db property to force initialization
  const dbPath = path.join(projectRoot, 'htb-knowledge.db');
  
  // Remove existing database to force rebuild
  if (fs.existsSync(dbPath)) {
    console.log('Removing existing database...');
    fs.unlinkSync(dbPath);
  }
  
  // Execute a dummy query to trigger initialization and rebuild
  console.log('Initializing and building embeddings...');
  try {
    const result = await tool.execute({
      query: 'test initialization',
      limit: 1
    }, new AbortController().signal);
    
    console.log('HTB Knowledge Base built successfully!');
    console.log(`Database location: ${dbPath}`);
    
    // Display database stats
    await displayDatabaseInfo();
  } catch (error) {
    console.error('Error building knowledge base:', error);
    process.exit(1);
  } finally {
    tool.cleanup();
  }
}

// Query the database
async function queryDatabase() {
  const options = parseArgs(args);
  
  if (!options.query) {
    console.error('Error: --query parameter is required');
    process.exit(1);
  }

  const config = createConfig();
  const tool = new HTBKnowledgeBaseTool(config);
  
  try {
    console.log(`Querying: "${options.query}"`);
    console.log(`Category: ${options.category}, Limit: ${options.limit}\n`);
    
    const result = await tool.execute({
      query: options.query,
      category: options.category === 'all' ? undefined : options.category,
      limit: options.limit
    }, new AbortController().signal);
    
    console.log(result.returnDisplay || result.llmContent);
  } catch (error) {
    console.error('Error querying knowledge base:', error);
    process.exit(1);
  } finally {
    tool.cleanup();
  }
}

// Display database information
async function displayDatabaseInfo() {
  const dbPath = path.join(projectRoot, 'htb-knowledge.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('Database not found. Run "build" command first.');
    return;
  }
  
  // Import better-sqlite3 dynamically
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  
  try {
    const stats = {
      totalDocuments: db.prepare('SELECT COUNT(*) as count FROM documents').get().count,
      webDocuments: db.prepare('SELECT COUNT(*) as count FROM documents WHERE category = ?').get('web').count,
      networkDocuments: db.prepare('SELECT COUNT(*) as count FROM documents WHERE category = ?').get('network').count,
      dbSize: fs.statSync(dbPath).size,
    };
    
    console.log('HTB Knowledge Base Statistics:');
    console.log('==============================');
    console.log(`Total documents: ${stats.totalDocuments}`);
    console.log(`Web pentesting: ${stats.webDocuments}`);
    console.log(`Network pentesting: ${stats.networkDocuments}`);
    console.log(`Database size: ${(stats.dbSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Database location: ${dbPath}`);
    
    // Check embedding provider
    const embeddingModel = process.env.HTB_EMBEDDING_MODEL || 'gemini';
    console.log(`\nEmbedding provider: ${embeddingModel}`);
    if (embeddingModel === 'ollama') {
      console.log(`Ollama model: ${process.env.HTB_OLLAMA_MODEL || 'nomic-embed-text'}`);
    }
  } finally {
    db.close();
  }
}

// Main execution
async function main() {
  try {
    switch (command) {
      case 'build':
        await buildDatabase();
        break;
      case 'query':
        await queryDatabase();
        break;
      case 'info':
        await displayDatabaseInfo();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log('Run with --help for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

main(); 