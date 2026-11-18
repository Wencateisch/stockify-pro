# One container: the static Stockify Pro web app + the Yahoo Finance proxy.
#   docker build -t stockify-pro .
#   docker run -p 3001:3001 stockify-pro
FROM node:20-alpine AS web

WORKDIR /web
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /srv
COPY backend/package.json backend/package-lock.json* ./backend/
RUN npm install --omit=dev --no-audit --no-fund --prefix ./backend
COPY backend/ ./backend/
COPY --from=web /web/dist ./public

ENV PORT=3001
ENV STATIC_DIR=/srv/public
EXPOSE 3001

CMD ["node", "backend/server.js"]
