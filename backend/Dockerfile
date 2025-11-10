# Dockerfile pour Backend TalentSecure
FROM node:18-alpine

# Installer les dépendances système nécessaires
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    openssl \
    openssl-dev

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./
COPY prisma ./prisma/

# Installer toutes les dépendances (dev + prod pour build TypeScript)
RUN npm ci

# Copier le reste du code
COPY . .

# Générer le client Prisma
RUN npx prisma generate

# Compiler TypeScript
RUN npm run build

# Supprimer les devDependencies après le build
RUN npm prune --production

# Créer le dossier uploads
RUN mkdir -p uploads/cvs uploads/videos

# Exposer le port
EXPOSE 8080

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=8080

# Commande de démarrage
CMD ["npm", "start"]
