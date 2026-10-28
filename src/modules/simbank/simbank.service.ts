import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { verifySimbankWebhook, type SimbankWebhookPayload } from '@wlisfes/chat-web-base-schema/observe'
import { RabbitmqService, SMS_SIMBANK_WEBHOOK_ROUTING_KEY, SMS_SIMBANK_WEBHOOK_EXCHANGE } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { resolveHooksSimbankOptions } from '@/modules/simbank/simbank.constants'
import { SimbankWebhookDedupe } from '@/modules/simbank/simbank.dedupe'

/** Observe 回执的请求原文和签名头。 */
export interface SimbankWebhookRequest {
    body: string
    timestamp?: string
    signature?: string
}

/** 回执受理结果。 */
export interface SimbankWebhookResult {
    msgId: string
    /** true 表示去重窗口内已转发过，本次没有重复转发。 */
    duplicate: boolean
}

const SEND_STATUSES = new Set(['success', 'failed'])

/**
 * 接收 Observe 发送回执：校验签名和字段、按短信ID去重后发布到回执队列，由 Dispatch 写回发送记录。
 * Hooks 不连接数据库，只做校验和转发；发布失败返回 503，Observe 会按退避间隔重试。
 */
@Injectable()
export class SimbankService {
    private readonly logger = new Logger(SimbankService.name)
    private readonly dedupe = new SimbankWebhookDedupe()

    constructor(
        private readonly configService: ConfigService,
        private readonly rabbitmqService: RabbitmqService
    ) {}

    public async httpBaseSimbankWebhook(request: SimbankWebhookRequest): Promise<SimbankWebhookResult> {
        this.verify(request)
        const receipt = this.parse(request.body)
        // 同一短信只会有一个最终结果，按短信ID + 结果去重。
        const key = `${receipt.msgId}:${receipt.sendStatus}`
        if (this.dedupe.has(key)) return { msgId: receipt.msgId, duplicate: true }
        try {
            await this.rabbitmqService.publish(SMS_SIMBANK_WEBHOOK_EXCHANGE, SMS_SIMBANK_WEBHOOK_ROUTING_KEY, receipt, { messageId: key })
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            this.logger.error(`回执转发失败，等待 Observe 重试：msgId=${receipt.msgId}，原因=${reason}`)
            throw new ServiceUnavailableException('回执转发失败，请稍后重试')
        }
        this.dedupe.add(key)
        this.logger.log(
            `回执已转发：msgId=${receipt.msgId}，msgKeyId=${receipt.msgKeyId}，portKeyId=${receipt.portKeyId}，sendStatus=${receipt.sendStatus}，statusCode=${receipt.statusCode}`
        )
        return { msgId: receipt.msgId, duplicate: false }
    }

    private verify({ body, timestamp, signature }: SimbankWebhookRequest): void {
        let secret: string
        try {
            secret = resolveHooksSimbankOptions(this.configService.get('simbank')).secret
        } catch (error) {
            this.logger.error(error instanceof Error ? error.message : String(error))
            throw new ServiceUnavailableException('回执签名未配置')
        }
        if (!verifySimbankWebhook({ secret, timestamp, signature, body })) throw new UnauthorizedException('回执签名无效或已过期')
    }

    private parse(body: string): SimbankWebhookPayload {
        let value: Record<string, unknown>
        try {
            value = JSON.parse(body) as Record<string, unknown>
        } catch {
            throw new BadRequestException('回执不是有效的 JSON')
        }
        const msgId = typeof value?.msgId === 'string' ? value.msgId.trim() : ''
        const keys = [value?.msgKeyId, value?.simbankKeyId, value?.portKeyId].map(Number)
        if (!msgId || !keys.every(key => Number.isInteger(key) && key > 0)) {
            throw new BadRequestException('回执缺少 msgId、msgKeyId、simbankKeyId 或 portKeyId')
        }
        if (!SEND_STATUSES.has(String(value.sendStatus))) throw new BadRequestException('回执 sendStatus 必须是 success 或 failed')
        const [msgKeyId, simbankKeyId, portKeyId] = keys
        return {
            msgId,
            msgKeyId,
            simbankKeyId,
            portKeyId,
            sendStatus: value.sendStatus as SimbankWebhookPayload['sendStatus'],
            statusCode: String(value.statusCode ?? 'UNKNOWN') as SimbankWebhookPayload['statusCode'],
            statusMessage: String(value.statusMessage ?? ''),
            sendTime: typeof value.sendTime === 'string' ? value.sendTime : new Date().toISOString()
        }
    }
}
