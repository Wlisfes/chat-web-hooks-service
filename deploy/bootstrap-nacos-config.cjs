'use strict'

/** 部署前准备 Hooks Nacos 配置。已有配置只校验，不覆盖人工修改；回执入口只在 Docker 网络内供 Observe 调用，不追加网关路由。 */

function required(name, environment = process.env) {
    const value = environment[name]
    if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少环境变量：${name}`)
    return value.trim()
}

function scalar(value) {
    return JSON.stringify(value)
}

function getBaseUrl(environment = process.env) {
    const server = required('NACOS_SERVER', environment)
    return (/^https?:\/\//i.test(server) ? server : `http://${server}`).replace(/\/$/, '')
}

async function getNacosAccessToken(environment = process.env) {
    const username = environment.NACOS_USERNAME?.trim()
    const password = environment.NACOS_PASSWORD
    if (!username || password === undefined) return undefined
    const response = await fetch(`${getBaseUrl(environment)}/nacos/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password })
    })
    if (!response.ok) throw new Error(`Nacos 鉴权失败：HTTP ${response.status}`)
    const result = await response.json()
    if (typeof result.accessToken !== 'string' || !result.accessToken.trim()) throw new Error('Nacos 鉴权响应缺少 accessToken')
    return result.accessToken
}

async function configUrl(dataId, environment = process.env) {
    const parameters = new URLSearchParams({
        dataId,
        group: environment.NACOS_CONFIG_GROUP?.trim() || 'DEFAULT_GROUP',
        tenant: environment.NACOS_NAMESPACE?.trim() || 'public'
    })
    const accessToken = await getNacosAccessToken(environment)
    if (accessToken) parameters.set('accessToken', accessToken)
    return `${getBaseUrl(environment)}/nacos/v1/cs/configs?${parameters}`
}

async function readConfig(dataId, environment = process.env) {
    const response = await fetch(await configUrl(dataId, environment))
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`读取 Nacos 配置失败：${dataId} HTTP ${response.status}`)
    const content = await response.text()
    return content.trim() ? content.replace(/\r\n?/g, '\n') : undefined
}

async function writeConfig(dataId, content, environment = process.env) {
    const response = await fetch(await configUrl(dataId, environment), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ content })
    })
    if (!response.ok) throw new Error(`写入 Nacos 配置失败：${dataId} HTTP ${response.status}`)
}

function topLevelBlock(content, name) {
    const lines = content.replace(/\r\n?/g, '\n').split('\n')
    const start = lines.findIndex(line => line === `${name}:`)
    if (start < 0) return undefined
    let end = lines.findIndex((line, index) => index > start && line.trim() && !line.startsWith(' ') && !line.startsWith('#'))
    if (end < 0) end = lines.length
    return lines.slice(start, end).join('\n').trimEnd()
}

function createHooksConfig(source, environment = process.env) {
    const gateway = topLevelBlock(source, 'gateway')
    const rabbitmq = topLevelBlock(source, 'rabbitmq')
    if (!gateway || !rabbitmq) throw new Error('来源 Nacos 配置缺少 gateway 或 rabbitmq，无法生成 Hooks 配置')
    if (!/vhost:\s*"?\/chat-sms"?/.test(rabbitmq)) throw new Error('来源 RabbitMQ 配置 vhost 必须为 /chat-sms')
    return `# 服务监听配置。
server:
  # 容器内 HTTP 监听端口：Observe 回执、健康检查和 Swagger。
  port: 5110

# SIMBANK 回执签名密钥；必须与 Observe Nacos hooks.secret 一致。
simbank:
  secret: ${scalar(environment.HOOKS_SIMBANK_SECRET?.trim() || require('node:crypto').randomBytes(32).toString('base64url'))}

# 服务间调用与网关身份上下文验签配置；从现有服务复制，必须与 Gateway 保持一致。
${gateway}

# 回执转发到 /chat-sms 虚拟主机的回执队列，由 Dispatch 消费；从 Dispatch 复制。
${rabbitmq}
`
}

function validateHooksConfig(content) {
    if (!/^\s+port:\s*5110\s*$/m.test(content)) throw new Error('Hooks Nacos 配置缺少 server.port: 5110')
    if (!/^simbank:\n\s+secret:/m.test(content)) throw new Error('Hooks Nacos 配置缺少 simbank.secret')
    if (!/^rabbitmq:/m.test(content) || !content.includes('/chat-sms')) throw new Error('Hooks Nacos 配置缺少 rabbitmq（vhost /chat-sms）')
    if (!content.includes('service_token:') || !content.includes('secret:')) throw new Error('Hooks Nacos 配置缺少网关凭据')
    return content
}

async function ensureHooksConfig(environment = process.env) {
    const dataId = environment.NACOS_CONFIG_DATA_ID?.trim() || 'chat-web-hooks-service.yaml'
    const existing = await readConfig(dataId, environment)
    if (existing) {
        validateHooksConfig(existing)
        return false
    }
    const source = await readConfig('chat-web-dispatch-service.yaml', environment)
    if (!source) throw new Error('未找到 chat-web-dispatch-service.yaml，无法复制网关和 RabbitMQ 配置')
    await writeConfig(dataId, validateHooksConfig(createHooksConfig(source, environment)), environment)
    return true
}

async function main() {
    const created = await ensureHooksConfig()
    process.stdout.write(
        created
            ? 'Hooks Nacos 配置已创建；请把 simbank.secret 复制到 Observe Nacos hooks.secret\n'
            : 'Hooks Nacos 配置已存在且校验通过\n'
    )
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}

module.exports = { createHooksConfig, validateHooksConfig }
