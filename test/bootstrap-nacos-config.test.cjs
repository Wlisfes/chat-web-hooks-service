const test = require('node:test')
const assert = require('node:assert/strict')
const {
    createHooksConfig,
    validateHooksConfig,
    ensureGatewayRoute,
    ensurePublicPath,
    ensureSkylineDatabase
} = require('../deploy/bootstrap-nacos-config.cjs')

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

test('Hooks Nacos 配置包含 5110 和 /chat-sms RabbitMQ，包含 SRM 库连接和 prefetch 1，不包含回执密钥和 Redis', () => {
    const content = createHooksConfig(source, { HOOKS_MYSQL_PASSWORD: 'db-pass' })
    assert.throws(() => validateHooksConfig(content), /chat-web-skyline/)
    assert.match(content, /port: 5110/)
    assert.doesNotMatch(content, /^simbank:/m)
    assert.match(content, /vhost: \/chat-sms/)
    assert.match(content, /prefetch: 1/)
    assert.match(content, /username: "chat_web_hooks_service"/)
    assert.doesNotMatch(content, /redis:/)
    assert.match(content, /database: "chat-web-srm"/)
})

test('已有 Hooks 配置缺少 Skyline 库时补上，已有节点不覆盖', () => {
    const skyline = `database:\n  chat-web-skyline:\n    host: "mysql"\n    database: "chat-web-skyline"\n    username: "skyline"\n    password: "secret"\n`
    const existing = createHooksConfig(source, { HOOKS_MYSQL_PASSWORD: 'db-pass' })
    const updated = ensureSkylineDatabase(existing, skyline)
    validateHooksConfig(updated)
    assert.match(updated, /chat-web-skyline:\n    host: "mysql"/)
    assert.equal(ensureSkylineDatabase(updated, skyline), updated)
})

test('来源缺少 rabbitmq 或配置缺少数据库时失败', () => {
    assert.throws(() => createHooksConfig('gateway:\n  a: 1\n', {}), /rabbitmq/)
    assert.throws(() => validateHooksConfig('server:\n  port: 5110\n'), /rabbitmq/)
})

test('网关追加 /api/observe 路由和回执公开路径，重复执行不改动', () => {
    const gateway = '  auth:\n    enabled: true\n    publicPaths:\n      - /health\n  routes:\n    - id: srm\n      prefix: /api/srm\n'
    const updated = ensurePublicPath(ensureGatewayRoute(gateway))
    assert.match(updated, /- id: observe-webhook\n      prefix: \/api\/observe\n      serviceName: chat-web-hooks-service/)
    assert.match(updated, /publicPaths:\n      - \/api\/observe\/simbank\/webhook\n/)
    assert.equal(ensurePublicPath(ensureGatewayRoute(updated)), updated)
})
