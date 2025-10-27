# Task MCP - Production-Ready Change Management Platform

[![npm version](https://badge.fury.io/js/%40fission-ai%2Fopenspec.svg)](https://badge.fury.io/js/%40fission-ai%2Fopenspec)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen)](https://nodejs.org/)

**AI-native system for spec-driven development with 4.5-minute onboarding** ✨

Task MCP is a production-ready change management platform that enables teams to create, manage, and track development specifications with AI assistance. Built with a dockerless-first approach and comprehensive IDE integration, Task MCP gets developers productive in under 5 minutes.

---

## 🚀 Key Achievements

- **⚡ 4.5-Minute Onboarding** - Complete workflow from setup to first change
- **🐳 Dockerless-First** - Only Node.js and git required for development
- **🔧 5 IDE Integrations** - Native support for VS Code, JetBrains, Vim, Emacs, and Claude Code
- **📋 Professional Templates** - 6 ready-to-use proposal and task templates
- **🏭 Production-Ready** - One-liner Docker deployment with health checks
- **⚡ High Performance** - 10,424 items/second pagination, 56.4 MB/second streaming

---

## 🎯 Quick Start (3 Commands)

Get productive in less than 5 minutes with just Node.js and git:

```bash
# 1. Clone and install dependencies
git clone https://github.com/Fission-AI/OpenSpec.git
cd OpenSpec
npm install

# 2. Start Task MCP server
npm run dev

# 3. Create your first change (in new terminal)
npx openspec change create "my-feature"
```

That's it! You're now running Task MCP with full IDE integration support.

---

## ✨ Features

### 🎨 Template System
- **6 Professional Templates** - Feature, bugfix, and chore variants
- **Task MCP Integration** - Built-in subagent assignments and dependencies
- **Resource URI Linking** - Seamless connections between proposals and tasks
- **Quality Gates** - Built-in acceptance criteria and validation

### 🔌 IDE Integration
- **Claude Code** - Native MCP integration with `@` discovery
- **VS Code** - MCP extension with workspace configuration
- **JetBrains IDEs** - Plugin-based integration with XML config
- **Vim/Neovim** - Lua-based MCP.nvim integration
- **Emacs** - Elisp-based MCP.el integration

### 🏗️ Flexible Deployment
- **Dockerless Development** - Node.js and git only
- **Production Docker** - One-liner deployment with TLS, health checks, monitoring
- **HTTP/HTTPS Support** - Both stdio and HTTP server modes
- **Environment Configuration** - Flexible setup for any environment

### 📊 Performance & Monitoring
- **Health Check Endpoints** - `/healthz`, `/readyz`, `/health`
- **Structured Logging** - Comprehensive audit trails
- **Performance Metrics** - Real-time monitoring and benchmarking
- **Rate Limiting** - Built-in protection and throttling

---

## 📦 Installation

### Option 1: Dockerless Development (Recommended)

**Requirements:**
- Node.js 20.19.0+
- git

```bash
# Clone and setup
git clone https://github.com/Fission-AI/OpenSpec.git
cd OpenSpec
npm install

# Start development server
npm run dev
```

### Option 2: Production Docker Deployment

```bash
# Basic HTTP deployment
docker run --rm -p 8443:8443 \
  -e AUTH_TOKENS=devtoken \
  ghcr.io/fission-ai/task-mcp-http:latest

# HTTPS with TLS certificates
docker run --rm -p 8443:8443 \
  -e AUTH_TOKENS=devtoken \
  -v $(pwd)/tls.key:/app/tls.key:ro \
  -v $(pwd)/tls.crt:/app/tls.crt:ro \
  -e TLS_KEY=/app/tls.key \
  -e TLS_CERT=/app/tls.crt \
  ghcr.io/fission-ai/task-mcp-http:latest
```

---

## 📚 Documentation

| Guide | Description | Link |
|-------|-------------|------|
| **Quickstart** | 5-minute onboarding workflow | [docs/quickstart.md](docs/quickstart.md) |
| **IDE Integration** | Multi-IDE setup and configuration | [docs/ide_guides.md](docs/ide_guides.md) |
| **Docker Deployment** | Production deployment guide | [docs/docker_oneliner.md](docs/docker_oneliner.md) |
| **Templates** | Proposal and task templates | [templates/README.md](templates/README.md) |
| **Examples** | Sample repository and API integration | [examples/README.md](examples/README.md) |
| **API Reference** | Complete API documentation | [docs/api_reference.md](docs/api_reference.md) |
| **Troubleshooting** | Common issues and solutions | [docs/troubleshooting.md](docs/troubleshooting.md) |

---

## 🏎️ Performance Metrics

Latest benchmark results from production testing:

| Metric | Result | Description |
|--------|--------|-------------|
| **Pagination Performance** | 10,424 items/second | Large dataset handling |
| **Streaming Performance** | 56.4 MB/second | Real-time data transfer |
| **Concurrency Performance** | 121.9ms average | 10 concurrent requests |
| **Memory Efficiency** | -583KB growth | Proper cleanup and optimization |
| **Onboarding Time** | 4.5 minutes | Complete setup to first change |

---

## 🔒 Production Readiness

### Security Features
- **Authentication** - Token-based auth with configurable providers
- **TLS/SSL Support** - HTTPS with certificate mounting
- **CORS Configuration** - Cross-origin resource sharing controls
- **Rate Limiting** - Built-in request throttling
- **Security Headers** - OWASP-recommended headers

### Health & Monitoring
- **Health Endpoints** - `/healthz`, `/readyz`, `/health`
- **Structured Logging** - JSON logs with correlation IDs
- **Metrics Collection** - Performance and usage metrics
- **Graceful Shutdown** - Proper connection handling
- **Container Health Checks** - Docker-native health monitoring

### Deployment Features
- **Zero-Downtime Deployment** - Rolling updates support
- **Environment Configuration** - Flexible setup options
- **Docker Compose Ready** - Multi-container orchestration
- **Kubernetes Compatible** - Cloud-native deployment
- **Backup & Recovery** - Data protection strategies

---

## 🎯 Resource URI Patterns

Task MCP provides powerful resource discovery in supported IDEs:

```
@task:change://slug/proposal     # Change proposals
@task:change://slug/tasks        # Task lists
@task:change://slug/delta/file   # Specification files
changes://active                 # All active changes
```

Type `@` in any supported IDE to discover and attach resources automatically.

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
```bash
# Clone repository
git clone https://github.com/Fission-AI/OpenSpec.git
cd OpenSpec

# Install dependencies
npm install

# Run tests
npm test

# Start development
npm run dev
```

### Quality Gates
- **Tests:** All tests must pass (`npm test`)
- **Type Checking:** TypeScript must be clean (`npm run build`)
- **Linting:** Code must pass linting rules
- **Documentation:** Updates must include documentation changes

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🆘 Support

- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/Fission-AI/OpenSpec/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Fission-AI/OpenSpec/discussions)
- **Troubleshooting:** [docs/troubleshooting.md](docs/troubleshooting.md)

---

## 🗺️ Roadmap

### Phase 7 (Optional Enhancements)
- Video documentation of 5-minute workflow
- Advanced IDE features and custom extensions
- Template marketplace and community contributions
- Performance optimization for enterprise deployments
- Mobile IDE support (tablets/phones)

### Future Opportunities
- Enterprise features (SSO, audit trails, compliance)
- AI-powered template suggestions
- Advanced analytics and insights
- Integration ecosystem expansion

---

**Built with ❤️ by the OpenSpec community**

---

*Last updated: 2025-10-26 | Version: 0.13.0*