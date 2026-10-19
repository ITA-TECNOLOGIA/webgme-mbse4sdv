# MBSE4SDV MCP server (Streamable HTTP transport on /mcp)
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    HOST=0.0.0.0 \
    PORT=3000 \
    BASE_URL=http://webgme:8888/mbse4sdv/api

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.js ./

USER node
EXPOSE 3000

CMD ["node", "server.js"]
