FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Crea cartella per la cache persistente
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
ENV NAS_MOVIES_PATH=/mnt/nas/movies

EXPOSE 3001

CMD ["node", "src/server.js"]
