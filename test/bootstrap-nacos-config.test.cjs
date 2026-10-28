const test = require('node:test')
const assert = require('node:assert/strict')
const { createHooksConfig, validateHooksConfig } = require('../deploy/bootstrap-nacos-config.cjs')

const source = `server:
  port: 5080
gateway:
  feign:
    service_token: "token"
    url: http://chat-web-gateway-service:5000
  principal:
    secret: "secret"
rabbitmq:
  host: chat-web-rabbitmq
  username: dispatch
  password: pass
  vhost: /chat-sms
redis:
  host: chat-web-redis
`

test('Hooks Nacos 配置包含 5110、回执签名密钥和 /chat-sms RabbitMQ，包含 SRM 库连接和 prefetch 1，不包含 Redis', () => {
    const content = createHooksConfig(source, { HOOKS_SIMBANK_SECRET: 'hooks-secret', HOOKS_MYSQL_PASSWORD: 'db-pass' })
    validateHooksConfig(content)
    assert.match(content, /port: 5110/)
    assert.match(content, /simbank:\n  secret: "hooks-secret"/)
    assert.match(content, /vhost: \/chat-sms/)
    assert.match(content, /prefetch: 1/)
    assert.match(content, /username: "chat_web_hooks_service"/)
    assert.doesNotMatch(content, /redis:/)
    assert.match(content, /database: "chat-web-srm"/)
    assert.match(
        createHooksConfig(source, { HOOKS_MYSQL_PASSWORD: 'db-pass' }),
        /simbank:\n  secret: "[A-Za-z0-9_-]{20,}"/,
        '未提供密钥时随机生成'
    )
})

test('来源缺少 rabbitmq 或配置缺少密钥时失败', () => {
    assert.throws(() => createHooksConfig('gateway:\n  a: 1\n', {}), /rabbitmq/)
    assert.throws(() => validateHooksConfig('server:\n  port: 5110\n'), /simbank\.secret/)
})
