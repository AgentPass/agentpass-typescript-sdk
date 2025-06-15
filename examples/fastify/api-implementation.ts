/**
 * Fastify API Implementation
 * 
 * This module contains Fastify-specific API server implementation
 * using the shared data from ../shared/api-data.ts
 */

import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sampleUsers, sampleProjects, sampleDepartments } from '../shared/api-data';

/**
 * Creates a complete Fastify app with all API endpoints
 */
export async function createSampleAPI(): Promise<FastifyInstance> {
  const app = fastify();

  // Register all routes first, before the app starts listening
  await app.register(async function(fastify) {
    // Users endpoints
    fastify.get('/api/users', async (request: FastifyRequest, reply: FastifyReply) => {
      const { page = 1, limit = 10, role, department } = request.query as any;
      let users = [...sampleUsers];

      // Apply filters
      if (role) users = users.filter(u => u.role === role);
      if (department) users = users.filter(u => u.department.toLowerCase().includes(String(department).toLowerCase()));

      // Pagination
      const startIndex = (Number(page) - 1) * Number(limit);
      const endIndex = startIndex + Number(limit);
      const paginatedUsers = users.slice(startIndex, endIndex);

      return {
        users: paginatedUsers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: users.length,
          totalPages: Math.ceil(users.length / Number(limit))
        }
      };
    });

    fastify.get('/api/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      const userId = parseInt(id || '0');
      const user = sampleUsers.find(u => u.id === userId);
      
      if (user) {
        return { user };
      } else {
        reply.status(404);
        return { error: 'User not found', code: 'USER_NOT_FOUND' };
      }
    });

    fastify.post('/api/users', async (request: FastifyRequest, reply: FastifyReply) => {
      const { name, email, role = 'user', department, status = 'active' } = request.body as any;
      
      if (!name || !email) {
        reply.status(400);
        return { 
          error: 'Name and email are required', 
          code: 'VALIDATION_ERROR',
          details: 'Please provide both name and email fields'
        };
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

      reply.status(201);
      return { 
        user: newUser, 
        message: 'User created successfully' 
      };
    });

    // Projects endpoints
    fastify.get('/api/projects', async (request: FastifyRequest, reply: FastifyReply) => {
      const { status, department } = request.query as any;
      let projects = [...sampleProjects];

      if (status) projects = projects.filter(p => p.status === status);
      if (department) projects = projects.filter(p => p.department.toLowerCase().includes(String(department).toLowerCase()));

      return {
        projects,
        summary: {
          total: projects.length,
          byStatus: {
            active: projects.filter(p => p.status === 'active').length,
            planning: projects.filter(p => p.status === 'planning').length,
            completed: projects.filter(p => p.status === 'completed').length
          }
        }
      };
    });

    // Departments endpoint
    fastify.get('/api/departments', async (request: FastifyRequest, reply: FastifyReply) => {
      return { departments: sampleDepartments };
    });

    // Analytics endpoint (simple nested path demonstration)
    fastify.get('/api/analytics/overview', async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        totalUsers: 25,
        totalProjects: 11,
        totalBudget: 1620000
      };
    });
  });

  return app;
}