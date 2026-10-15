FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate --schema apps/backend/prisma/schema.prisma
