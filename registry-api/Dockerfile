FROM node:22-slim

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm install tsx --no-save

COPY src ./src
COPY tsconfig.json ./

EXPOSE 4310
CMD ["npx", "tsx", "src/server.ts"]
