# Multi-stage: deps → build → thin runner. The DB is a mounted volume, never baked into the image.
FROM node:24-alpine AS deps
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./
# build needs no real secrets; dummy key keeps the provider route fail-closed
RUN DATABASE_URL=/tmp/build.db ADMIN_CODE=dummy GEMINI_API_KEY=google-dummy-studio-key npm run build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
USER app
EXPOSE 3000
# data/ holds the SQLite file — mount a volume here in compose/host config
VOLUME ["/app/data"]
CMD ["npm", "start"]
