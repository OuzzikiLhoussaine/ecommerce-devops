# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---------- runtime ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ARG APP_VERSION=1.0.0
ENV APP_VERSION=$APP_VERSION
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
