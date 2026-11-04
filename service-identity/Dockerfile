FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install
RUN npx prisma generate

COPY . .

RUN npm run build

EXPOSE 3001

CMD ["sh", "-c", "node -e \"const {Client}=require('pg');const url=process.env.DATABASE_URL.replace(/\\/service_identity_db(\\?.*)?$/,'/postgres$1');const c=new Client({connectionString:url});c.connect().then(()=>c.query('CREATE DATABASE service_identity_db')).catch(()=>{}).finally(()=>c.end());\" && npx prisma migrate deploy && if [ -f dist/src/main.js ]; then node dist/src/main.js; else node dist/main.js; fi"]
