import { HOOKS_SIMBANK_WEBHOOK_DEDUPE_MAX_SIZE, HOOKS_SIMBANK_WEBHOOK_DEDUPE_TTL_MS } from '@/modules/simbank/simbank.constants'

/**
 * 回执去重：Observe 推送超时重试时，同一回执可能到达多次，窗口内只转发一次。
 * 只在本实例内存，多实例或重启后可能重复转发；Dispatch 写回只更新 submitted 记录，重复回执不会覆盖结果。
 */
export class SimbankWebhookDedupe {
    private readonly entries = new Map<string, number>()

    constructor(
        private readonly ttlMs = HOOKS_SIMBANK_WEBHOOK_DEDUPE_TTL_MS,
        private readonly maxSize = HOOKS_SIMBANK_WEBHOOK_DEDUPE_MAX_SIZE,
        private readonly now: () => number = Date.now
    ) {}

    /** 窗口内是否已转发过。 */
    public has(key: string): boolean {
        const expiredAt = this.entries.get(key)
        if (expiredAt === undefined) return false
        if (expiredAt <= this.now()) {
            this.entries.delete(key)
            return false
        }
        return true
    }

    /** 转发成功后记录。 */
    public add(key: string): void {
        this.entries.delete(key)
        this.entries.set(key, this.now() + this.ttlMs)
        while (this.entries.size > this.maxSize) {
            const oldest = this.entries.keys().next().value
            if (oldest === undefined) break
            this.entries.delete(oldest)
        }
    }

    public get size(): number {
        return this.entries.size
    }
}
