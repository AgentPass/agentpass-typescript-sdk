/**
 * Shared API Data for Complete MCP Server Examples
 * 
 * This module contains the common JSON data used across
 * all framework examples (Express, Fastify, Koa, etc.).
 */

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