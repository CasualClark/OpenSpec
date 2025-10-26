# Dockerfile with integrated health checks for Task MCP HTTP Server
FROM node:20-alpine AS base

# Install health check dependencies
RUN apk add --no-cache \
    curl \
    jq \
    ca-certificates \
    && update-ca-certificates

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --prod

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies for health checks
RUN apk add --no-cache \
    curl \
    jq \
    ca-certificates \
    dumb-init \
    && update-ca-certificates

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S openspec -u 1001

# Set working directory
WORKDIR /app

# Copy built application from base stage
COPY --from=base --chown=openspec:nodejs /app/dist ./dist
COPY --from=base --chown=openspec:nodejs /app/node_modules ./node_modules
COPY --from=base --chown=openspec:nodejs /app/package.json ./package.json

# Create health check script
COPY --chown=openspec:nodejs docker/health-check.sh /usr/local/bin/health-check.sh
RUN chmod +x /usr/local/bin/health-check.sh

# Create readiness check script
COPY --chown=openspec:nodejs docker/readiness-check.sh /usr/local/bin/readiness-check.sh
RUN chmod +x /usr/local/bin/readiness-check.sh

# Switch to non-root user
USER openspec

# Expose port
EXPOSE 8443

# Set environment variables for health checks
ENV NODE_ENV=production
ENV HEALTH_CHECK_INTERVAL=30s
ENV HEALTH_CHECK_TIMEOUT=10s
ENV HEALTH_CHECK_RETRIES=3
ENV HEALTH_CHECK_START_PERIOD=30s

# Health check configuration
HEALTHCHECK --interval=${HEALTH_CHECK_INTERVAL} \
            --timeout=${HEALTH_CHECK_TIMEOUT} \
            --start-period=${HEALTH_CHECK_START_PERIOD} \
            --retries=${HEALTH_CHECK_RETRIES} \
            CMD /usr/local/bin/health-check.sh

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]