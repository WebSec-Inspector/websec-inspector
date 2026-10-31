FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_URL=http://localhost:8080/api
ARG APP_REVISION=development
ARG VITE_VERIFICATION_MAX_ATTEMPTS=20
ARG VITE_VERIFICATION_TIMEOUT_SECONDS=300
ARG VITE_VERIFICATION_RETRY_SECONDS=15
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_VERIFICATION_MAX_ATTEMPTS=${VITE_VERIFICATION_MAX_ATTEMPTS}
ENV VITE_VERIFICATION_TIMEOUT_SECONDS=${VITE_VERIFICATION_TIMEOUT_SECONDS}
ENV VITE_VERIFICATION_RETRY_SECONDS=${VITE_VERIFICATION_RETRY_SECONDS}
RUN npm run build
RUN printf '%s\n' "$APP_REVISION" > dist/version.txt

FROM nginx:1.31.6-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1:5173/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
