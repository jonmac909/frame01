FROM node:24.22.1-bookworm-slim
ENV NODE_ENV=production FRAME01_CLOUD=1 CHROME_PATH=/usr/bin/chromium FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg fonts-liberation fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY protocol.mjs local-files.mjs runner.mjs runner-child.mjs container.mjs runtime.mjs Dockerfile ./
EXPOSE 8080
CMD ["node", "container.mjs"]
