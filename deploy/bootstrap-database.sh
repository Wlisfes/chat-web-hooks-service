#!/bin/sh
set -eu

# Hooks 写回 SRM 设备短信记录，并写入供应商计费发件箱。账号已存在时不改密码。
USERNAME=${HOOKS_MYSQL_USERNAME:-chat_web_hooks_service}
MYSQL_CONTAINER=${HOOKS_MYSQL_CONTAINER:-chat-web-mysql}
PASSWORD_FILE=${HOOKS_MYSQL_PASSWORD_FILE:-/opt/chat-web-hooks-service/.hooks-mysql-password}

docker inspect "$MYSQL_CONTAINER" >/dev/null

mysql_root() {
    docker exec -i "$MYSQL_CONTAINER" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$@"' sh "$@" 2>&1 | grep -v 'Using a password' || true
}

user_count=$(docker exec "$MYSQL_CONTAINER" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "SELECT COUNT(*) FROM mysql.user WHERE user=\"'"$USERNAME"'\" AND host=\"%\""' 2>/dev/null)
if [ "$user_count" = "0" ]; then
    if [ ! -s "$PASSWORD_FILE" ]; then
        umask 077
        mkdir -p "$(dirname "$PASSWORD_FILE")"
        docker run --rm node:22-alpine node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))" > "$PASSWORD_FILE"
        printf '\n' >> "$PASSWORD_FILE"
        chmod 600 "$PASSWORD_FILE"
    fi
    password=$(tr -d '\r\n' < "$PASSWORD_FILE")
    printf "CREATE USER '%s'@'%%' IDENTIFIED BY '%s';\n" "$USERNAME" "$password" | mysql_root
fi
test -s "$PASSWORD_FILE" || { echo "缺少 Hooks 数据库密码文件：$PASSWORD_FILE" >&2; exit 1; }

sql=$(cat <<SQL
GRANT SELECT, UPDATE ON \`chat-web-srm\`.\`tb_srm_simbank_message\` TO '$USERNAME'@'%';
GRANT SELECT, INSERT, UPDATE ON \`chat-web-srm\`.\`tb_srm_billing_outbox\` TO '$USERNAME'@'%';
FLUSH PRIVILEGES;
SQL
)
printf '%s\n' "$sql" | mysql_root

echo "Hooks 已授权写回发送记录，并写入计费发件箱"
