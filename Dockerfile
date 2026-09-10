FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./
RUN npm install

COPY . .

# .env is NOT baked into the image — passed at run time (see docker-compose.yml
# or `docker run --env-file .env`). Never commit real secrets into the image.

EXPOSE 3000

CMD ["npm", "run", "dev"]
