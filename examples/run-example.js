#!/usr/bin/env node

/**
 * Example Runner with Transport Selection
 * 
 * This script allows running examples with transport selection:
 * npm run example:express -- --transport=http
 * npm run example:express -- --transport=sse
 * npm run example:express -- --transport=stdio (default)
 */

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const transportFlag = args.find(arg => arg.startsWith('--transport='));
const transport = transportFlag ? transportFlag.split('=')[1] : 'sse';

// Get the example type from npm script name
const npmScriptName = process.env.npm_lifecycle_event;
let exampleFile = '';

// Map npm script names to example files
switch (npmScriptName) {
  case 'example:express':
    if (transport === 'http') {
      exampleFile = 'examples/http-server.ts';
    } else if (transport === 'sse') {
      exampleFile = 'examples/sse-server.ts';
    } else {
      exampleFile = 'examples/stdio-server.ts'; // default to stdio
    }
    break;
  case 'example:fastify':
    if (transport === 'http') {
      exampleFile = 'examples/http-server.ts';
    } else if (transport === 'sse') {
      exampleFile = 'examples/sse-server.ts';
    } else {
      exampleFile = 'examples/stdio-server.ts'; // default to stdio
    }
    break;
  case 'example:koa':
    if (transport === 'http') {
      exampleFile = 'examples/http-server.ts';
    } else if (transport === 'sse') {
      exampleFile = 'examples/sse-server.ts';
    } else {
      exampleFile = 'examples/stdio-server.ts'; // default to stdio
    }
    break;
  case 'example:openapi':
    exampleFile = 'examples/integrations/openapi-petstore.ts';
    break;
  default:
    console.error(`Unknown example: ${npmScriptName}`);
    console.error(`Available examples: express, fastify, koa, openapi`);
    process.exit(1);
}

console.log(`🚀 Running ${npmScriptName} with transport: ${transport}`);
console.log(`📂 File: ${exampleFile}`);

// Run the example with ts-node
const tsNode = spawn('npx', ['ts-node', '--project', 'examples/tsconfig.json', exampleFile], {
  stdio: 'inherit',
  cwd: process.cwd()
});

tsNode.on('close', (code) => {
  process.exit(code);
});

tsNode.on('error', (error) => {
  console.error('Failed to start example:', error.message);
  process.exit(1);
});