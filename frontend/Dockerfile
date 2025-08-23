# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps reproducibly
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Pure browser build (no SSR/prerender). Put files in a fixed folder.
ARG BUILD_CONFIGURATION=production
ARG BROWSER_DIST=dist/browser
RUN npm run build -- --configuration ${BUILD_CONFIGURATION} --output-path=${BROWSER_DIST}

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine

# Copy built browser assets
COPY --from=build /app/dist/browser/ /usr/share/nginx/html/

# Minimal NGINX config for Angular SPA + caching
RUN cat > /etc/nginx/conf.d/default.conf <<'NGINX_CONF'
server {
  listen 80;
  listen [::]:80;
  server_name _;
  root /usr/share/nginx/html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cache static assets (Angular emits hashed filenames)
  location ~* \.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$ {
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri /index.html;
    access_log off;
  }

  gzip on;
  gzip_types text/plain application/javascript text/css application/json image/svg+xml;
  gzip_min_length 256;
}
NGINX_CONF

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
