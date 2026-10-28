#!/bin/sh
set -eu

IMAGE=${1:?Usage: deploy.sh IMAGE [COMPOSE_FILE]}
SERVICE_VERSION=${SERVICE_VERSION:-${IMAGE##*:}}
COMPOSE_FILE=${2:-compose.yml}
SERVICE=hooks-service
CONTAINER=chat-web-hooks-service
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
PULL_ATTEMPTS=${PULL_ATTEMPTS:-8}

test -f "$COMPOSE_FILE"
test -f .env

old_image=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)

compose() {
    IMAGE="$IMAGE" SERVICE_VERSION="$SERVICE_VERSION" docker compose -f "$COMPOSE_FILE" "$@"
}

rollback() {
    docker logs --tail 100 "$CONTAINER" 2>&1 || true
    if [ -n "$old_image" ] && [ "$old_image" != "$IMAGE" ]; then
        IMAGE="$old_image" SERVICE_VERSION="${old_image##*:}" docker compose -f "$COMPOSE_FILE" up -d --no-deps "$SERVICE"
    fi
}

attempt=1
until docker pull "$IMAGE"; do
    [ "$attempt" -lt "$PULL_ATTEMPTS" ] || exit 1
    sleep $((attempt * 5))
    attempt=$((attempt + 1))
done

# 部署前准备 Nacos 配置；已有配置只校验，不覆盖人工修改。Hooks 不连接数据库。
script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
docker run --rm --network host --env-file .env \
    -v "$script_dir/bootstrap-nacos-config.cjs:/app/bootstrap-nacos-config.cjs:ro" \
    -w /app node:22-alpine node bootstrap-nacos-config.cjs

if ! compose up -d --no-deps "$SERVICE"; then
    rollback
    exit 1
fi

elapsed=0
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER" 2>/dev/null || true)
    case "$state" in
        healthy)
            if ! docker exec "$CONTAINER" node -e "require('http').get('http://127.0.0.1:5110/health', response => process.exit(response.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"; then
                echo "Hooks health endpoint failed after the container became healthy." >&2
                rollback
                exit 1
            fi
            echo "Deployment succeeded: $IMAGE"
            exit 0
            ;;
        exited|dead|unhealthy)
            rollback
            exit 1
            ;;
    esac
    sleep 3
    elapsed=$((elapsed + 3))
done

rollback
exit 1
