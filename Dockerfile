FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY dist/ ./dist/

ENV MCP_TRANSPORT=http
ENV PORT=8847

EXPOSE 8847

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8847/health || exit 1

CMD ["node", "dist/index.js"]
