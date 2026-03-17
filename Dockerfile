# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create directory for nezha data
RUN mkdir -p /app/.tmp

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Copy configuration files
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY --from=builder /app/.env.example ./.env.example

# Expose ports
EXPOSE 4097

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node dist/cli/index.js health || exit 1

# Start the application
CMD ["node", "dist/cli/index.js", "start"]
