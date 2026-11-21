FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server.js ./
COPY tools ./tools
COPY public ./public
RUN for f in public/*.json public/index.html; do gzip -9 -k -f "$f"; done
ENV PORT=8080 DATA_DIR=/tmp/data
EXPOSE 8080
CMD ["node", "server.js"]
