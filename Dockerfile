# Use official Node.js base image 
FROM  --platform=linux/amd64 node:18-bullseye 

# Install dependencies and Google Chrome (clean, verified method)
RUN apt-get update && \
    apt-get install -y wget gnupg ca-certificates dirmngr && \
    mkdir -p /etc/apt/keyrings && \
    mkdir -p /root/.gnupg && chmod 700 /root/.gnupg && \
    gpg --no-default-keyring --keyring /etc/apt/keyrings/google-chrome.gpg \
        --keyserver keyserver.ubuntu.com --recv-keys 32EE5355A6BC6E42 && \
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy rest of the source code
COPY . .

# Start app
RUN mkdir -p /app/wwebjs_auth && chmod -R 777 /app/wwebjs_auth


# Puppeteer config (skip Chromium, use system Chrome)
ENV USE_FULL_PUPPETEER=false \
    CHROME_PATH=/usr/bin/google-chrome-stable \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# 🗂️ Persist authentication data
#VOLUME [ "/app/.wwebjs_auth" ]

EXPOSE 3000

CMD ["node", "server.js"]
