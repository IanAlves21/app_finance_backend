FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    openssl \
    libc6-compat

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install
RUN npx prisma generate

COPY . .

RUN npm run build

EXPOSE 3003

CMD ["sh", "-c", "node -e \"const {Client}=require('pg');const url=process.env.DATABASE_URL.replace(/\\/service_analytics_db(\\?.*)?$/,'/postgres$1');const c=new Client({connectionString:url});c.connect().then(()=>c.query('CREATE DATABASE service_analytics_db')).catch(()=>{}).finally(()=>c.end());\" && npx prisma db push && if [ -f dist/src/main.js ]; then node dist/src/main.js; else node dist/main.js; fi"]
