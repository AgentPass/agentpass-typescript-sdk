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
      exampleFile = 'examples/complete-servers/http-server.ts';
    } else if (transport === 'sse') {
      exampleFile = 'examples/complete-servers/sse-server.ts';
    } else if (transport === 'stdio') {
      exampleFile = 'examples/complete-servers/stdio-server.ts';
    } else {
      exampleFile = 'examples/frameworks/express/basic.ts';
    }
    break;
  case 'example:fastify':
    exampleFile = 'examples/frameworks/fastify/basic.ts';
    break;
  case 'example:koa':
    exampleFile = 'examples/frameworks/koa/basic.ts';
    break;
  case 'example:getting-started':
    exampleFile = 'examples/basic/getting-started.ts';
    break;
  case 'example:ecommerce':
    exampleFile = 'examples/advanced/ecommerce-api.ts';
    break;
  case 'example:openapi':
    exampleFile = 'examples/integrations/openapi-petstore.ts';
    break;
  default:
    console.error(`Unknown example: ${npmScriptName}`);
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