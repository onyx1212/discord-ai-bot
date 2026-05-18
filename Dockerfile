FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev libjpeg-turbo-dev giflib-dev librsvg-dev

FROM base AS deps
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

FROM base AS runner
ENV NODE_ENV=production
ENV TZ=UTC

RUN addgroup --system --gid 1001 botgroup && \
    adduser --system --uid 1001 botuser

COPY --from=deps --chown=botuser:botgroup /app/node_modules ./node_modules
COPY --chown=botuser:botgroup . .

RUN mkdir -p logs && chown -R botuser:botgroup logs

USER botuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('./src/config').validate()" || exit 1

EXPOSE 3000

CMD ["node", "src/index.js"]
