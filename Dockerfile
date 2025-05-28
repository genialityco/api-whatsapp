# Usa una imagen estable de Node.js
FROM node:18-bullseye

# Instala dependencias del sistema para Puppeteer + Chrome
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

# Copia sólo package.json y lock para caché
COPY package*.json ./

# Instala dependencias
RUN npm ci --production

# Copia el resto del código
COPY . .

# Define variable para que Puppeteer use el Chrome instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Expone el puerto que usa tu Express (por defecto 3000)
EXPOSE 3000

# Comando de arranque
CMD ["node", "server.js"]
