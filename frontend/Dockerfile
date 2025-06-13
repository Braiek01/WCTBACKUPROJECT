# Build stage
FROM node:18 as build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Use regular npm install
RUN npm install

# Copy rest of the application
COPY . .

# Build with client-side rendering (bypassing prerendering issues)
RUN npm run build -- --configuration production --ssr=false

# Production stage
FROM nginx:alpine

# Copy built files from build stage to nginx
COPY --from=build /app/dist/*/browser /usr/share/nginx/html/

# Add nginx configuration for SPA routing
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]