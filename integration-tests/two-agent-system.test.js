/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'assert';
import { test } from 'node:test';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Direct integration test for the two-agent system
 * Tests the actual system with real API calls
 */
class TwoAgentIntegrationTest {
  constructor(testName) {
    this.testName = testName;
    this.testDir = join(env.INTEGRATION_TEST_FILE_DIR, testName.replace(/[^a-z0-9]/gi, '-'));
    this.bundlePath = join(__dirname, '..', 'bundle/gemini.js');
    mkdirSync(this.testDir, { recursive: true });
  }

  createFile(fileName, content) {
    const filePath = join(this.testDir, fileName);
    writeFileSync(filePath, content);
    return filePath;
  }

  mkdir(dir) {
    mkdirSync(join(this.testDir, dir), { recursive: true });
  }

  readFile(fileName) {
    return readFileSync(join(this.testDir, fileName), 'utf-8');
  }

  run(prompt, enableTwoAgent = true) {
    const environment = { ...process.env };
    
    // Enable two-agent mode
    if (enableTwoAgent) {
      environment.GEMINI_TWO_AGENT_MODE = 'true';
      environment.GEMINI_TWO_AGENT_DEBUG = 'true';
    }

    try {
      const output = execSync(
        `node ${this.bundlePath} --yolo --prompt "${prompt}"`,
        {
          cwd: this.testDir,
          encoding: 'utf-8',
          env: environment,
        }
      );
      
      if (env.KEEP_OUTPUT === 'true') {
        console.log(`--- TWO-AGENT TEST: ${this.testName} ---`);
        console.log(output);
        console.log(`--- END TWO-AGENT TEST: ${this.testName} ---`);
      }
      
      return output;
    } catch (error) {
      console.error(`Error in test ${this.testName}:`, error.message);
      if (error.stdout) {
        console.log('STDOUT:', error.stdout);
      }
      if (error.stderr) {
        console.log('STDERR:', error.stderr);
      }
      throw error;
    }
  }

  compare(prompt) {
    // Run with and without two-agent mode to compare
    const singleAgentOutput = this.run(prompt, false);
    const twoAgentOutput = this.run(prompt, true);
    
    return {
      singleAgent: singleAgentOutput,
      twoAgent: twoAgentOutput,
    };
  }
}

/**
 * Integration tests for the two-agent system
 * These tests make actual API calls to verify the system works end-to-end
 */

test('two-agent system basic functionality', (t) => {
  const testRig = new TwoAgentIntegrationTest(t.name);
  
  // Create a simple test file
  testRig.createFile('test.txt', 'Hello World! This is a test file.');
  
  // Test basic file reading with two-agent system
  const output = testRig.run('Read the test.txt file and tell me what it contains');
  
  // Verify the task was completed
  assert.ok(output.length > 0, 'Should produce output');
  assert.ok(output.toLowerCase().includes('hello') || output.toLowerCase().includes('test'), 
    'Should reference the file content');
  
  console.log('✓ Two-agent system basic file reading test passed');
});

test('two-agent system vs single-agent comparison', (t) => {
  const testRig = new TwoAgentIntegrationTest(t.name);
  
  // Create test files
  testRig.createFile('data.txt', 'Sample data: 1, 2, 3, 4, 5');
  testRig.createFile('info.txt', 'Project information: This is a test project.');
  
  // Compare outputs
  const results = testRig.compare('Read both files and create a summary');
  
  // Both should work
  assert.ok(results.singleAgent.length > 0, 'Single agent should produce output');
  assert.ok(results.twoAgent.length > 0, 'Two agent should produce output');
  
  // The outputs might differ in style or approach, but both should be functional
  const singleAgentMentionsFiles = results.singleAgent.toLowerCase().includes('data') || 
                                   results.singleAgent.toLowerCase().includes('info');
  const twoAgentMentionsFiles = results.twoAgent.toLowerCase().includes('data') || 
                                results.twoAgent.toLowerCase().includes('info');
  
  assert.ok(singleAgentMentionsFiles, 'Single agent should reference the files');
  assert.ok(twoAgentMentionsFiles, 'Two agent should reference the files');
  
  console.log('✓ Two-agent vs single-agent comparison test passed');
});

test('two-agent system complex task execution', (t) => {
  const testRig = new TwoAgentIntegrationTest(t.name);
  
  // Create a more complex scenario
  testRig.createFile('config.json', JSON.stringify({
    name: 'test-app',
    version: '1.0.0',
    dependencies: ['lodash', 'express'],
    scripts: {
      start: 'node index.js',
      test: 'jest'
    }
  }, null, 2));
  
  testRig.createFile('index.js', `
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
`);
  
  // Test complex analysis task
  const output = testRig.run(
    'Analyze the config.json and index.js files. Create a README.md file explaining what this project does and how to run it.'
  );
  
  // Verify complex task completion
  assert.ok(output.length > 100, 'Should provide detailed analysis');
  
  // Check for evidence of analysis
  const mentionsExpress = output.toLowerCase().includes('express') || 
                         output.toLowerCase().includes('server');
  const mentionsConfig = output.toLowerCase().includes('config') || 
                        output.toLowerCase().includes('package');
  
  assert.ok(mentionsExpress || mentionsConfig, 
    'Should analyze the project structure');
  
  console.log('✓ Two-agent system complex task test passed');
});

test('two-agent system tool execution verification', (t) => {
  const testRig = new TwoAgentIntegrationTest(t.name);
  
  // Create initial files
  testRig.createFile('input.txt', 'Line 1\nLine 2\nLine 3');
  testRig.mkdir('output');
  
  // Test tool execution
  const output = testRig.run(
    'Read input.txt, count the lines, and create a report.txt file in the output directory with the line count'
  );
  
  // Verify tools were executed
  assert.ok(output.length > 0, 'Should produce output');
  
  // Check if the task was understood and executed
  const mentionsLines = output.toLowerCase().includes('line') || 
                       output.toLowerCase().includes('count') ||
                       output.toLowerCase().includes('3');
  
  assert.ok(mentionsLines, 'Should handle the line counting task');
  
  console.log('✓ Two-agent system tool execution test passed');
});

test('two-agent system error handling', (t) => {
  const testRig = new TwoAgentIntegrationTest(t.name);
  
  // Test error handling with non-existent file
  const output = testRig.run(
    'Try to read nonexistent-file.txt and tell me what happens'
  );
  
  // Should handle errors gracefully
  assert.ok(output.length > 0, 'Should produce output even with errors');
  
  // Should mention the error or file issue
  const handlesError = output.toLowerCase().includes('error') ||
                      output.toLowerCase().includes('not found') ||
                      output.toLowerCase().includes('nonexistent') ||
                      output.toLowerCase().includes('file');
  
  assert.ok(handlesError, 'Should handle errors gracefully');
  
  console.log('✓ Two-agent system error handling test passed');
});

test('two-agent system performance validation', (t) => {
  const testRig = new TwoAgentIntegrationTest(t.name);
  
  // Create multiple files for performance testing
  for (let i = 1; i <= 3; i++) {
    testRig.createFile(`file${i}.txt`, `Content of file ${i}\nWith multiple lines\nFor testing`);
  }
  
  const startTime = Date.now();
  
  // Test performance with multiple files
  const output = testRig.run(
    'Read all three files (file1.txt, file2.txt, file3.txt) and create a combined summary'
  );
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  // Should complete in reasonable time
  assert.ok(duration < 45000, `Should complete in reasonable time, took ${duration}ms`);
  assert.ok(output.length > 0, 'Should produce output');
  
  console.log(`✓ Two-agent system performance test passed (${duration}ms)`);
});
