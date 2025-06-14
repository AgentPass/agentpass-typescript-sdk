# Contributing to AgentPass TypeScript SDK

We welcome contributions to the AgentPass TypeScript SDK! This document provides guidelines for contributing to the project.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm, yarn, or pnpm
- TypeScript knowledge
- Familiarity with Express.js and HTTP APIs

### Development Setup

```bash
# Clone the repository
git clone https://github.com/AgentPass/agentpass-typescript-sdk.git
cd agentpass-typescript-sdk

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build

# Start development mode
npm run dev
```

## 🏗️ Project Structure

```
src/
├── core/              # Core AgentPass functionality
│   ├── AgentPass.ts   # Main AgentPass class
│   ├── types.ts       # TypeScript interfaces
│   └── constants.ts   # Constants and defaults
├── discovery/         # Endpoint discovery modules
│   ├── base/          # Base discoverer class
│   ├── express/       # Express.js discoverer
│   ├── fastify/       # Fastify discoverer
│   ├── koa/           # Koa.js discoverer
│   ├── nestjs/        # NestJS discoverer
│   ├── nextjs/        # Next.js discoverer
│   ├── openapi/       # OpenAPI discoverer
│   └── url/           # URL crawling discoverer
├── mcp/              # MCP server generation
├── middleware/       # Middleware implementations
└── plugins/          # Plugin system
```

## 🧪 Testing

We use Jest for testing. All new features should include comprehensive tests.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- src/core/AgentPass.test.ts
```

### Test Structure

- Unit tests for individual classes and functions
- Integration tests for complete workflows
- Example tests to ensure examples work correctly

## 📝 Code Style

We use ESLint and TypeScript for code quality:

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix
```

### Style Guidelines

- Use TypeScript for all code
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Prefer composition over inheritance
- Use async/await over Promises
- Keep functions small and focused

## 🔍 Discovery System

When adding new discoverers:

1. Extend `BaseDiscoverer`
2. Implement required methods:
   - `supports(options)` - Check if discoverer can handle options
   - `discover(options)` - Extract endpoints from source
3. Add comprehensive error handling
4. Include tests for various scenarios
5. Update documentation

### Example Discoverer

```typescript
export class MyDiscoverer extends BaseDiscoverer {
  constructor() {
    super('my-discoverer', '1.0.0');
  }

  supports(options: DiscoverOptions): boolean {
    return options.framework === 'my-framework';
  }

  async discover(options: DiscoverOptions): Promise<EndpointDefinition[]> {
    // Implementation
  }
}
```

## 🔧 Middleware System

When creating middleware:

1. Follow middleware interface patterns
2. Add proper error handling
3. Include configuration options
4. Document expected behavior
5. Add examples of usage

### Middleware Types

- **Auth**: Authentication and user identification
- **Authz**: Authorization and permission checking  
- **Pre**: Request preprocessing
- **Post**: Response transformation
- **Error**: Error handling and transformation

## 🧩 Plugin System

Plugins extend AgentPass functionality:

```typescript
export const MyPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  
  async onDiscover(endpoints, agentpass) {
    // Enhance discovered endpoints
  },
  
  async onGenerate(mcpConfig, agentpass) {
    // Modify MCP configuration
  }
};
```

## 📚 Documentation

- Update README.md for new features
- Add JSDoc comments to public APIs
- Include examples for new functionality
- Update CHANGELOG.md with changes

## 🐛 Bug Reports

When reporting bugs:

1. Use the issue template
2. Include minimal reproduction case
3. Specify environment details
4. Add relevant logs/error messages

## ✨ Feature Requests

For new features:

1. Open an issue for discussion
2. Provide use case and rationale
3. Consider implementation approach
4. Be willing to implement or help

## 🔄 Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch from `main`
3. **Make** your changes with tests
4. **Test** thoroughly
5. **Document** changes
6. **Submit** pull request

### PR Guidelines

- Keep changes focused and atomic
- Write clear commit messages
- Include tests for new functionality
- Update documentation as needed
- Follow existing code style

### Commit Messages

Use conventional commit format:

```
type(scope): description

- feat: new feature
- fix: bug fix
- docs: documentation changes
- style: formatting changes
- refactor: code refactoring
- test: test additions/changes
- chore: maintenance tasks
```

Examples:
```
feat(discovery): add Fastify discoverer
fix(mcp): handle undefined endpoint parameters
docs(readme): update installation instructions
```

## 🏷️ Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release PR
4. Tag release after merge
5. Publish to npm

## 📋 Code Review

All submissions require code review:

- Check for correctness and efficiency
- Verify tests and documentation
- Ensure backward compatibility
- Validate security implications

## 🛡️ Security

- Never commit secrets or credentials
- Validate all inputs
- Follow security best practices
- Report vulnerabilities privately

## 💬 Community

- Be respectful and inclusive
- Help others learn and contribute
- Share knowledge and best practices
- Celebrate successes together

## 🙏 Recognition

Contributors are recognized in:

- CONTRIBUTORS.md file
- Release notes
- Project documentation

Thank you for contributing to AgentPass! 🎉