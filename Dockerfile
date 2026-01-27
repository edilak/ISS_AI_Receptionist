# Multi-stage build for ISS AI Receptionist
# Stage 1: Build React frontend
FROM node:18-alpine AS client-builder

WORKDIR /app/client

# Copy client package files
COPY client/package.json client/package-lock.json ./

# Install client dependencies (including dev dependencies for build)
RUN npm ci

# Copy client source
COPY client/ ./

# Build React app
RUN npm run build

# Stage 2: Build server and combine
FROM node:18-alpine AS server-builder

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy server files
COPY server/ ./server/

# Copy built client from previous stage
COPY --from=client-builder /app/client/build ./client/build

# Stage 3: Production runtime
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy server files
COPY --chown=nodejs:nodejs server/ ./server/

# Copy built client
COPY --from=client-builder --chown=nodejs:nodejs /app/client/build ./client/build

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server/index.js"]

