# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Ensure CLI doesn't prompt/phone home in CI
ENV NG_CLI_ANALYTICS=false
ENV NODE_ENV=production

# Copy manifests explicitly so npm ci uses the lockfile
COPY package.json package-lock.json ./

# Strict, reproducible install (fails if lockfile is out of sync)
RUN npm ci

# Copy source
COPY . .

# Pure browser build (no SSR/prerender). Fixed output path.
ARG BUILD_CONFIGURATION=production
RUN npm run build -- --configuration ${BUILD_CONFIGURATION} --output-path=dist/browser

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine

# Remove default site content
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets
COPY --from=build /app/dist/browser/ /usr/share/nginx/html/

# Angular SPA routing + static asset caching
RUN cat > /etc/nginx/conf.d/default.conf <<'NGINX_CONF'
server {
  listen 80;
  listen [::]:80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cache hashed static assets for a year
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
