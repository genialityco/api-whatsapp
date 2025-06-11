# Usa una imagen estable de Node.js
FROM node:18-bullseye

# Instala Chrome para Puppeteer
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

# Copia package.json y package-lock.json para aprovechar caché
COPY package*.json ./

# Instala dependencias solo en producción
RUN npm ci --production

# Copia el resto de la aplicación
COPY . .

# Variables consistentes con tu configuración en server.js
ENV USE_FULL_PUPPETEER=false \
    CHROME_PATH=/usr/bin/google-chrome-stable \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Expone el puerto del servidor
EXPOSE 3000

# Comando para ejecutar el servidor
CMD ["node", "server.js"]
