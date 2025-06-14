#!/usr/bin/env node

/**
 * AgentPass MCP Server for Claude Desktop
 * 
 * This script creates an MCP server that Claude Desktop can connect to.
 * It converts Express API endpoints into MCP tools automatically.
 * 
 * Usage:
 * 1. Run this script: node mcp-server-for-claude.mjs
 * 2. Add to Claude Desktop config
 * 3. Claude can then use the generated tools to interact with your API
 */

import { AgentPass } from './dist/core/AgentPass.js';
import express from 'express';

async function startMCPServerForClaude() {
  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error('🚀 Starting AgentPass MCP Server for Claude Desktop...');

  try {
    // =============================================================================
    // STEP 1: CREATE EXPRESS APP FOR ENDPOINT DISCOVERY
    // =============================================================================
    const app = express();
    app.use(express.json());

    // Define your API endpoints here - these will become MCP tools for Claude
    // Replace these with your actual API endpoints
    
    app.get('/api/users', (req, res) => {
      const { page = 1, limit = 10, role, department } = req.query;
      let users = [
        { id: 1, name: 'Alice Johnson', email: 'alice@company.com', role: 'admin', department: 'Engineering', status: 'active' },
        { id: 2, name: 'Bob Smith', email: 'bob@company.com', role: 'user', department: 'Sales', status: 'active' },
        { id: 3, name: 'Carol Davis', email: 'carol@company.com', role: 'manager', department: 'Marketing', status: 'active' },
        { id: 4, name: 'David Wilson', email: 'david@company.com', role: 'user', department: 'Support', status: 'inactive' },
        { id: 5, name: 'Emma Brown', email: 'emma@company.com', role: 'admin', department: 'Engineering', status: 'active' }
      ];

      // Apply filters
      if (role) users = users.filter(u => u.role === role);
      if (department) users = users.filter(u => u.department.toLowerCase().includes(department.toLowerCase()));

      // Pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      const paginatedUsers = users.slice(startIndex, endIndex);

      res.json({
        users: paginatedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: users.length,
          totalPages: Math.ceil(users.length / limit)
        }
      });
    });

    app.get('/api/users/:id', (req, res) => {
      const userId = parseInt(req.params.id);
      const users = [
        { id: 1, name: 'Alice Johnson', email: 'alice@company.com', role: 'admin', department: 'Engineering', status: 'active', joinDate: '2022-01-15', projects: ['Project Alpha', 'Project Beta'] },
        { id: 2, name: 'Bob Smith', email: 'bob@company.com', role: 'user', department: 'Sales', status: 'active', joinDate: '2022-03-20', projects: ['Sales Campaign Q1'] },
        { id: 3, name: 'Carol Davis', email: 'carol@company.com', role: 'manager', department: 'Marketing', status: 'active', joinDate: '2021-11-10', projects: ['Brand Refresh', 'Website Redesign'] },
        { id: 4, name: 'David Wilson', email: 'david@company.com', role: 'user', department: 'Support', status: 'inactive', joinDate: '2023-02-05', projects: [] },
        { id: 5, name: 'Emma Brown', email: 'emma@company.com', role: 'admin', department: 'Engineering', status: 'active', joinDate: '2021-08-12', projects: ['Project Gamma', 'Infrastructure'] }
      ];

      const user = users.find(u => u.id === userId);
      if (user) {
        res.json({ user });
      } else {
        res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
      }
    });

    app.post('/api/users', (req, res) => {
      const { name, email, role = 'user', department, status = 'active' } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({ 
          error: 'Name and email are required', 
          code: 'VALIDATION_ERROR',
          details: 'Please provide both name and email fields'
        });
      }

      const newUser = {
        id: Math.floor(Math.random() * 10000),
        name,
        email,
        role,
        department: department || 'General',
        status,
        joinDate: new Date().toISOString().split('T')[0],
        projects: [],
        createdAt: new Date().toISOString()
      };

      res.status(201).json({ 
        user: newUser, 
        message: 'User created successfully' 
      });
    });

    app.get('/api/projects', (req, res) => {
      const { status, department } = req.query;
      let projects = [
        { id: 1, name: 'Project Alpha', description: 'Next-gen mobile app', status: 'active', department: 'Engineering', budget: 150000, deadline: '2024-06-30' },
        { id: 2, name: 'Project Beta', description: 'AI chatbot integration', status: 'planning', department: 'Engineering', budget: 200000, deadline: '2024-09-15' },
        { id: 3, name: 'Sales Campaign Q1', description: 'Q1 2024 sales initiative', status: 'completed', department: 'Sales', budget: 50000, deadline: '2024-03-31' },
        { id: 4, name: 'Brand Refresh', description: 'Company rebranding project', status: 'active', department: 'Marketing', budget: 75000, deadline: '2024-05-20' },
        { id: 5, name: 'Website Redesign', description: 'Corporate website overhaul', status: 'planning', department: 'Marketing', budget: 100000, deadline: '2024-08-01' }
      ];

      if (status) projects = projects.filter(p => p.status === status);
      if (department) projects = projects.filter(p => p.department.toLowerCase().includes(department.toLowerCase()));

      res.json({
        projects,
        summary: {
          total: projects.length,
          byStatus: {
            active: projects.filter(p => p.status === 'active').length,
            planning: projects.filter(p => p.status === 'planning').length,
            completed: projects.filter(p => p.status === 'completed').length
          }
        }
      });
    });

    app.get('/api/departments', (req, res) => {
      res.json({
        departments: [
          { id: 1, name: 'Engineering', userCount: 15, budget: 800000, manager: 'Alice Johnson' },
          { id: 2, name: 'Sales', userCount: 8, budget: 300000, manager: 'John Sales' },
          { id: 3, name: 'Marketing', userCount: 6, budget: 250000, manager: 'Carol Davis' },
          { id: 4, name: 'Support', userCount: 4, budget: 150000, manager: 'Support Lead' },
          { id: 5, name: 'HR', userCount: 3, budget: 120000, manager: 'HR Director' }
        ]
      });
    });

    app.get('/api/analytics/overview', (req, res) => {
      res.json({
        overview: {
          totalUsers: 25,
          activeProjects: 3,
          completedProjects: 8,
          totalBudget: 1620000,
          departments: 5,
          averageProjectDuration: 120, // days
          userGrowthRate: 15.2, // percentage
          projectSuccessRate: 88.9 // percentage
        },
        monthlyStats: [
          { month: 'Jan', newUsers: 3, completedProjects: 1, budget: 125000 },
          { month: 'Feb', newUsers: 2, completedProjects: 2, budget: 200000 },
          { month: 'Mar', newUsers: 4, completedProjects: 1, budget: 150000 },
          { month: 'Apr', newUsers: 1, completedProjects: 3, budget: 300000 }
        ]
      });
    });

    app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: 'production',
        database: 'connected',
        services: {
          api: 'operational',
          auth: 'operational',
          notifications: 'operational'
        }
      });
    });

    // =============================================================================
    // STEP 2: INITIALIZE AGENTPASS AND DISCOVER ENDPOINTS
    // =============================================================================
    const agentpass = new AgentPass({
      name: 'company-management-api',
      version: '1.0.0',
      description: 'Company Management API - User, Project, and Analytics Tools'
    });

    // Discover endpoints from the Express app
    await agentpass.discover({ app, framework: 'express' });
    const endpoints = agentpass.getEndpoints();
    
    console.error(`✅ Discovered ${endpoints.length} API endpoints`);

    // =============================================================================
    // STEP 3: GENERATE MCP SERVER
    // =============================================================================
    const mcpServer = await agentpass.generateMCPServer({
      name: 'company-management-mcp-server',
      version: '1.0.0',
      description: 'MCP Server for Company Management - Provides tools for user management, project tracking, and analytics',
      transport: 'stdio',
      baseUrl: 'http://localhost:3001', // Local API server (you'll need to start one)
      toolNaming: (endpoint) => {
        const method = endpoint.method.toLowerCase();
        let pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
        
        // Remove 'api' from path parts for cleaner tool names
        pathParts = pathParts.filter(p => p !== 'api');
        
        const resource = pathParts[pathParts.length - 1] || 'endpoint';
        
        if (endpoint.path.includes('{')) {
          return `${method}_${resource}_by_id`;
        }
        
        // Handle nested resources like /analytics/overview
        if (pathParts.length > 1) {
          return `${method}_${pathParts.join('_')}`;
        }
        
        return `${method}_${resource}`;
      },
      toolDescription: (endpoint) => {
        // Custom descriptions based on endpoint
        const descriptions = {
          'GET /api/users': 'Retrieve users with optional filtering by role, department, and pagination',
          'GET /api/users/:id': 'Get detailed information about a specific user by their ID',
          'POST /api/users': 'Create a new user with name, email, role, department, and status',
          'GET /api/projects': 'List projects with optional filtering by status and department',
          'GET /api/departments': 'Get all departments with user counts, budgets, and managers',
          'GET /api/analytics/overview': 'Get comprehensive analytics overview including user stats, project metrics, and growth rates',
          'GET /api/health': 'Check API health status and service availability'
        };
        
        return descriptions[`${endpoint.method} ${endpoint.path}`] || 
               `${endpoint.method} request to ${endpoint.path}`;
      }
    });

    // =============================================================================
    // STEP 4: START MCP SERVER
    // =============================================================================
    await mcpServer.start();
    
    console.error('✅ MCP Server started successfully!');
    console.error(`📋 Server Info:`);
    console.error(`   Name: ${mcpServer.info.name}`);
    console.error(`   Version: ${mcpServer.info.version}`);
    console.error(`   Transport: ${mcpServer.transport.type}`);
    console.error(`   Tools Available: ${endpoints.length}`);
    console.error('');
    console.error('🔧 Available Tools for Claude:');
    endpoints.forEach((endpoint, index) => {
      const method = endpoint.method.toLowerCase();
      let pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
      pathParts = pathParts.filter(p => p !== 'api');
      const resource = pathParts[pathParts.length - 1] || 'endpoint';
      
      let toolName;
      if (endpoint.path.includes('{')) {
        toolName = `${method}_${resource}_by_id`;
      } else if (pathParts.length > 1) {
        toolName = `${method}_${pathParts.join('_')}`;
      } else {
        toolName = `${method}_${resource}`;
      }
      
      console.error(`   ${index + 1}. ${toolName} - ${endpoint.method} ${endpoint.path}`);
    });
    console.error('');
    console.error('🎯 Ready for Claude Desktop connection!');
    console.error('📖 Add this to your Claude Desktop config:');
    console.error('   {');
    console.error('     "mcpServers": {');
    console.error('       "company-api": {');
    console.error('         "command": "node",');
    console.error(`         "args": ["${process.cwd()}/mcp-server-for-claude.mjs"]`);
    console.error('       }');
    console.error('     }');
    console.error('   }');
    console.error('');

    // =============================================================================
    // STEP 5: HANDLE GRACEFUL SHUTDOWN
    // =============================================================================
    const cleanup = async () => {
      console.error('\n🛑 Shutting down MCP server...');
      try {
        await mcpServer.stop();
        console.error('✅ MCP server stopped gracefully');
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
      }
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGQUIT', cleanup);
    
    // Keep the process running
    process.stdin.resume();

  } catch (error) {
    console.error('❌ Failed to start MCP server:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Start the MCP server
startMCPServerForClaude();