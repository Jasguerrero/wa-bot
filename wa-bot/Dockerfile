FROM node:23-slim

# Set working directory
WORKDIR /usr/server

# Copy package.json files from the current directory
COPY wa-bot/package*.json ./
COPY .env .env

# Install dependencies
RUN npm install

# Copy app source code
COPY ./wa-bot ./wa-bot

# Create auth_info directory for WhatsApp session data
RUN mkdir -p ./wa-bot/auth_info

# Set NODE_ENV to production
ENV NODE_ENV=production

# Command to run the app
CMD ["node", "./wa-bot/index.js"]
