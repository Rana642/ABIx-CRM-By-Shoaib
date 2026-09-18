FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3300
ENV PORT=3300
# Listen on every interface: Docker sets HOSTNAME to the container id, and Next would bind only
# to that address, so the middleware's own call to 127.0.0.1 (the login check) was refused.
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
