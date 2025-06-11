FROM node:18-bullseye

RUN apt-get update && \
    apt-get install -y wget gnupg ca-certificates && \
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub \
       | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p /app/wwebjs_auth && chmod -R 777 /app/wwebjs_auth

COPY package*.json ./

RUN npm ci --production

COPY . .

ENV USE_FULL_PUPPETEER=false \
    CHROME_PATH=/usr/bin/google-chrome-stable \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 3000

CMD ["node", "server.js"]
