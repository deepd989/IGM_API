# Use a lightweight Node image
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy rest of the app
COPY . .

# Create images directory inside container
RUN mkdir -p images

# App runs on port 3000
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
