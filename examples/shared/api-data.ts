/**
 * Shared API Data for Complete MCP Server Examples
 * 
 * This module contains the common API endpoints and data used across
 * all complete MCP server examples (stdio, HTTP, SSE transports).
 */

import express, { Request, Response } from 'express';

// Sample data
export const sampleUsers = [
  { id: 1, name: 'Alice Johnson', email: 'alice@company.com', role: 'admin', department: 'Engineering', status: 'active', joinDate: '2022-01-15', projects: ['Project Alpha', 'Project Beta'] },
  { id: 2, name: 'Bob Smith', email: 'bob@company.com', role: 'user', department: 'Sales', status: 'active', joinDate: '2022-03-20', projects: ['Sales Campaign Q1'] },
  { id: 3, name: 'Carol Davis', email: 'carol@company.com', role: 'manager', department: 'Marketing', status: 'active', joinDate: '2021-11-10', projects: ['Brand Refresh', 'Website Redesign'] },
  { id: 4, name: 'David Wilson', email: 'david@company.com', role: 'user', department: 'Support', status: 'inactive', joinDate: '2023-02-05', projects: [] },
  { id: 5, name: 'Emma Brown', email: 'emma@company.com', role: 'admin', department: 'Engineering', status: 'active', joinDate: '2021-08-12', projects: ['Project Gamma', 'Infrastructure'] }
];

export const sampleProjects = [
  { id: 1, name: 'Project Alpha', description: 'Next-gen mobile app', status: 'active', department: 'Engineering', budget: 150000, deadline: '2024-06-30' },
  { id: 2, name: 'Project Beta', description: 'AI chatbot integration', status: 'planning', department: 'Engineering', budget: 200000, deadline: '2024-09-15' },
  { id: 3, name: 'Sales Campaign Q1', description: 'Q1 2024 sales initiative', status: 'completed', department: 'Sales', budget: 50000, deadline: '2024-03-31' },
  { id: 4, name: 'Brand Refresh', description: 'Company rebranding project', status: 'active', department: 'Marketing', budget: 75000, deadline: '2024-05-20' },
  { id: 5, name: 'Website Redesign', description: 'Corporate website overhaul', status: 'planning', department: 'Marketing', budget: 100000, deadline: '2024-08-01' }
];

export const sampleDepartments = [
  { id: 1, name: 'Engineering', userCount: 15, budget: 800000, manager: 'Alice Johnson' },
  { id: 2, name: 'Sales', userCount: 8, budget: 300000, manager: 'John Sales' },
  { id: 3, name: 'Marketing', userCount: 6, budget: 250000, manager: 'Carol Davis' },
  { id: 4, name: 'Support', userCount: 4, budget: 150000, manager: 'Support Lead' },
  { id: 5, name: 'HR', userCount: 3, budget: 120000, manager: 'HR Director' }
];

/**
 * Creates a complete Express app with all API endpoints
 */
export function createSampleAPI(): express.Application {
  const app = express();
  app.use(express.json());

  // Users endpoints
  app.get('/api/users', (req: Request, res: Response) => {
    const { page = 1, limit = 10, role, department } = req.query;
    let users = [...sampleUsers];

    // Apply filters
    if (role) users = users.filter(u => u.role === role);
    if (department) users = users.filter(u => u.department.toLowerCase().includes(String(department).toLowerCase()));

    // Pagination
    const startIndex = (Number(page) - 1) * Number(limit);
    const endIndex = startIndex + Number(limit);
    const paginatedUsers = users.slice(startIndex, endIndex);

    res.json({
      users: paginatedUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: users.length,
        totalPages: Math.ceil(users.length / Number(limit))
      }
    });
  });

  app.get('/api/users/:id', (req: Request, res: Response) => {
    const userId = parseInt(req.params.id);
    const user = sampleUsers.find(u => u.id === userId);
    
    if (user) {
      res.json({ user });
    } else {
      res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
  });

  app.post('/api/users', (req: Request, res: Response) => {
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

  // Projects endpoints
  app.get('/api/projects', (req: Request, res: Response) => {
    const { status, department } = req.query;
    let projects = [...sampleProjects];

    if (status) projects = projects.filter(p => p.status === status);
    if (department) projects = projects.filter(p => p.department.toLowerCase().includes(String(department).toLowerCase()));

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

  // Departments endpoint
  app.get('/api/departments', (req: Request, res: Response) => {
    res.json({ departments: sampleDepartments });
  });

  // Analytics endpoint (simple nested path demonstration)
  app.get('/api/analytics/overview', (req: Request, res: Response) => {
    res.json({
      totalUsers: 25,
      totalProjects: 11,
      totalBudget: 1620000
    });
  });



  return app;
}

/**
 * Common MCP tool naming function
 */
export function toolNaming(endpoint: any): string {
  const method = endpoint.method.toLowerCase();
  let pathParts = endpoint.path.split('/').filter((p: string) => p && !p.startsWith('{'));
  
  // Remove 'api' from path parts for cleaner tool names
  pathParts = pathParts.filter((p: string) => p !== 'api');
  
  const resource = pathParts[pathParts.length - 1] || 'endpoint';
  
  if (endpoint.path.includes('{')) {
    return `${method}_${resource}_by_id`;
  }
  
  // Handle nested resources like /analytics/overview
  if (pathParts.length > 1) {
    return `${method}_${pathParts.join('_')}`;
  }
  
  return `${method}_${resource}`;
}

/**
 * Common MCP tool descriptions
 */
export function toolDescription(endpoint: any): string {
  const descriptions: Record<string, string> = {
    'GET /api/users': 'Retrieve users with optional filtering by role, department, and pagination',
    'GET /api/users/:id': 'Get detailed information about a specific user by their ID',
    'POST /api/users': 'Create a new user with name, email, role, department, and status',
    'GET /api/projects': 'List projects with optional filtering by status and department',
    'GET /api/departments': 'Get all departments with user counts, budgets, and managers',
    'GET /api/analytics/overview': 'Get basic analytics overview with totals',
  };
  
  return descriptions[`${endpoint.method} ${endpoint.path}`] || 
         `${endpoint.method} request to ${endpoint.path}`;
}