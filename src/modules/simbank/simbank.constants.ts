/** 回执队列所在的 RabbitMQ 虚拟主机，与 Dispatch 一致；Nacos `rabbitmq.vhost` 必须是这个值。 */
export const HOOKS_RABBITMQ_VHOST = '/chat-sms'
/** 同一短信回执的去重窗口：窗口内重复推送直接返回成功，不重复转发。下游写回只更新 submitted 记录，窗口外重复也不会覆盖结果。 */
export const HOOKS_SIMBANK_WEBHOOK_DEDUPE_TTL_MS = 10 * 60 * 1000
/** 去重记录上限，超出时淘汰最早的记录。 */
export const HOOKS_SIMBANK_WEBHOOK_DEDUPE_MAX_SIZE = 100_000

/** Nacos `simbank` 节点：SIMBANK 回执签名配置。 */
export interface HooksSimbankOptions {
    /** 回执签名密钥，必须与 Observe Nacos `hooks.secret` 一致。 */
    secret: string
}

/** 解析 Nacos `simbank` 节点；缺少密钥时报错，拒绝所有回执。 */
export function resolveHooksSimbankOptions(config: unknown): HooksSimbankOptions {
    const record = config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>) : {}
    const secret = typeof record.secret === 'string' ? record.secret.trim() : ''
    if (!secret) throw new Error('Nacos simbank.secret 未配置，无法校验 SIMBANK 回执签名')
    return { secret }
}
