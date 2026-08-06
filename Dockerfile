FROM node:20-alpine

WORKDIR /app

# Instalar herramientas de compilación para paquetes nativos C/C++
RUN apk add --no-cache python3 make g++

# Instalar dependencias de producción
COPY package*.json ./
RUN npm ci

# Copiar código del proyecto
COPY . .

# Crear directorio de datos y archivos multimedia
RUN mkdir -p /app/data /app/data/media

EXPOSE 3000

CMD ["node", "src/server.js"]
