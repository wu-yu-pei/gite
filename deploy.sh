#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.prod.yml"
NGINX_CONF="./nginx/upstream.conf"
MAX_RETRIES=15
RETRY_INTERVAL=2

# Determine current active slot
if grep -q "app-blue" "$NGINX_CONF"; then
    OLD="app-blue"
    NEW="app-green"
else
    OLD="app-green"
    NEW="app-blue"
fi

echo "==> Current: $OLD, deploying: $NEW"

# Build and start the new slot
echo "==> Building and starting $NEW..."
docker compose -f "$COMPOSE_FILE" up -d --build "$NEW"

# Wait for health check
echo "==> Waiting for $NEW to be healthy..."
for i in $(seq 1 $MAX_RETRIES); do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$(docker compose -f "$COMPOSE_FILE" ps -q "$NEW")" 2>/dev/null || echo "starting")
    if [ "$STATUS" = "healthy" ]; then
        echo "==> $NEW is healthy"
        break
    fi
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        echo "==> ERROR: $NEW failed health check, rolling back"
        docker compose -f "$COMPOSE_FILE" stop "$NEW"
        exit 1
    fi
    echo "    Attempt $i/$MAX_RETRIES - status: $STATUS"
    sleep $RETRY_INTERVAL
done

# Switch Nginx upstream
echo "==> Switching traffic to $NEW..."
cat > "$NGINX_CONF" <<EOF
upstream app {
    server ${NEW}:3000;
}
EOF

docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload

# Stop old slot
echo "==> Stopping $OLD..."
docker compose -f "$COMPOSE_FILE" stop "$OLD"

# Clean up old images
docker image prune -f

echo "==> Deploy complete: $NEW is live"
