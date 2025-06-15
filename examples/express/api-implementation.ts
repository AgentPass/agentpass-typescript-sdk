/**
 * Express API Implementation
 * 
 * This module contains Express-specific API server implementation
 * using the shared data from ../shared/api-data.ts
 */

import express, { Request, Response } from 'express';
import { sampleUsers, sampleProjects, sampleDepartments } from '../shared/api-data';

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
    const userId = parseInt(req.params.id || '0');
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

    return res.status(201).json({ 
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