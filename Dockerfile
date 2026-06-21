FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
ENV DATABASE_URL="placeholder"
ENV REDIS_URL="placeholder"
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]