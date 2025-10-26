# Task MCP HTTP Server - Production Multi-stage Dockerfile
# Optimized for security, performance, and minimal attack surface

# ========================================
# Build Stage
# ========================================
FROM node:20-alpine AS builder

# Set build arguments
ARG BUILD_VERSION=1.0.0
ARG GIT_COMMIT
ARG BUILD_DATE

# Set environment variables for build
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install build dependencies
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Install pnpm
RUN corepack enable pnpm

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# ========================================
# Dependencies Stage
# ========================================
FROM node:20-alpine AS dependencies

# Set environment variables
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Install pnpm
RUN corepack enable pnpm

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# ========================================
# Runtime Stage
# ========================================
FROM gcr.io/distroless/nodejs20-debian12 AS runtime

# Metadata labels
LABEL maintainer="Fission AI <team@fission.ai>"
LABEL version="${BUILD_VERSION:-1.0.0}"
LABEL description="Task MCP HTTPS/SSE Server"
LABEL org.opencontainers.image.title="Task MCP HTTP Server"
LABEL org.opencontainers.image.description="Production-ready HTTPS/SSE server for Task MCP"
LABEL org.opencontainers.image.version="${BUILD_VERSION:-1.0.0}"
LABEL org.opencontainers.image.created="${BUILD_DATE:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}"
LABEL org.opencontainers.image.revision="${GIT_COMMIT:-unknown}"
LABEL org.opencontainers.image.source="https://github.com/Fission-AI/OpenSpec"
LABEL org.opencontainers.image.licenses="MIT"

# Create non-root user (distroless images have node user)
USER node

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

# Copy health check script (will be added later)
COPY --chown=node:node docker/health-check.sh ./health-check.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node dist/health-check.js || exit 1

# Set entrypoint to use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# ========================================
# Development Stage (for local development)
# ========================================
FROM node:20-alpine AS development

# Set environment variables
ENV NODE_ENV=development

# Install development dependencies
RUN apk add --no-cache \
    curl \
    git \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies
RUN corepack enable pnpm && pnpm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start development server with hot reload
CMD ["pnpm", "run", "start:dev"]