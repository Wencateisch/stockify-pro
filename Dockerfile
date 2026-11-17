FROM node:20-alpine AS web-builder

WORKDIR /app/web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY backend/package*.json ./backend/
RUN npm install --omit=dev --no-audit --no-fund --prefix ./backend
COPY backend/ ./backend/
COPY --from=web-builder /app/web/build ./web/build

ENV PORT=3001
EXPOSE 3001

CMD ["node", "backend/server.js"]
