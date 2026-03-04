# Contributing to Melo

Thank you for your interest in contributing to Melo! We welcome contributions from the community.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [GitHub Issues](https://github.com/yourusername/melo/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, browser)
   - Screenshots if applicable

### Suggesting Features

1. Check existing issues to avoid duplicates
2. Create a new issue with:
   - Clear use case
   - Expected behavior
   - Why this feature would be useful
   - Potential implementation approach (optional)

### Submitting Pull Requests

1. **Fork the repository** and create your branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Make your changes:**
   - Follow existing code style
   - Write meaningful commit messages
   - Add tests for new features
   - Update documentation if needed

4. **Run tests:**
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

5. **Commit your changes:**
   ```bash
   git commit -m "feat: add amazing feature"
   ```
   
   Use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` — New feature
   - `fix:` — Bug fix
   - `docs:` — Documentation changes
   - `style:` — Code style changes (formatting)
   - `refactor:` — Code refactoring
   - `test:` — Adding or updating tests
   - `chore:` — Maintenance tasks

6. **Push to your fork:**
   ```bash
   git push origin feature/my-feature
   ```

7. **Open a Pull Request** with:
   - Clear description of changes
   - Related issue number (if applicable)
   - Screenshots for UI changes

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+
- Redis 7+
- Spotify Developer Account

### Environment Setup

```bash
# Clone your fork
git clone https://github.com/yourusername/melo.git
cd melo

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Generate JWT keys
pnpm --filter @melo/server generate-keys

# Run migrations
pnpm --filter @melo/server migrate

# Start dev servers
pnpm dev
```

## Project Structure

- `apps/server/` — Fastify API backend
- `apps/web/` — React frontend
- `packages/shared/` — Shared types
- `apps/e2e/` — End-to-end tests

## Code Style

- TypeScript strict mode enabled
- 2 spaces for indentation
- Use ESLint + Prettier (configured)
- Follow existing patterns in codebase
- Prefer functional components and hooks
- Use meaningful variable names

## Testing Guidelines

- Write unit tests for new functions
- Write integration tests for API endpoints
- Write component tests for React components
- Aim for meaningful test coverage
- Mock external dependencies (Spotify API, Redis)

```bash
# Run specific test file
pnpm --filter @melo/server test -- src/services/queue.test.ts

# Watch mode for development
pnpm --filter @melo/server test:watch
```

## Documentation

- Update README.md for user-facing changes
- Update DEPLOYMENT.md for deployment changes
- Add inline comments for complex logic
- Update API documentation for endpoint changes

## Need Help?

- Ask questions in GitHub Issues
- Check existing documentation
- Review closed PRs for similar changes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for making Melo better! 🎵
