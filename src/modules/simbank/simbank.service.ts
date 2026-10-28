import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { type SimbankWebhookPayload } from '@wlisfes/chat-web-base-schema/observe'
import { RabbitmqService, SMS_SIMBANK_WEBHOOK_EXCHANGE, SMS_SIMBANK_WEBHOOK_ROUTING_KEY } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { SimbankWebhookDedupe } from '@/modules/simbank/simbank.dedupe'
import { isEmpty, fetchVagueKeyword } from '@wlisfes/chat-web-base-schema/utils'

/** 开放回执请求：只使用 JSON 原文，不校验签名。 */
export interface SimbankWebhookRequest {
    body: string
}

/** 回执受理结果。 */
export interface SimbankWebhookResult {
    msgId: string
    /** true 表示去重窗口内已转发过，本次没有重复转发。 */
    duplicate: boolean
}

const SEND_STATUSES = new Set(['success', 'failed'])

/**
 * 开放接口：不校验登录态、签名和 Nacos 回执密钥。msgId 和 sendStatus 仍要合法，定位字段缺失不影响入队。
 * 写回发送状态由队列消费者逐条处理。发布失败返回 503，Observe 会按退避间隔重试。
 */
@Injectable()
export class SimbankService {
    private readonly logger = new Logger(SimbankService.name)
    private readonly dedupe = new SimbankWebhookDedupe()

    constructor(private readonly rabbitmqService: RabbitmqService) {}

    public async httpBaseSimbankWebhook(request: SimbankWebhookRequest): Promise<SimbankWebhookResult> {
        const input = this.parse(request.body)
        const key = `${input.msgId}:${input.sendStatus}`
        if (this.dedupe.has(key)) {
            return { msgId: input.msgId, duplicate: true }
        }
        try {
            await this.rabbitmqService.publish(SMS_SIMBANK_WEBHOOK_EXCHANGE, SMS_SIMBANK_WEBHOOK_ROUTING_KEY, receipt, {
                messageId: key
            })
        } catch (error) {
            // const reason = error instanceof Error ? error.message : String(error)
            // this.logger.error(`回执入队失败，等待 Observe 重试：msgId=${receipt.msgId}，原因=${reason}`)
            // throw new ServiceUnavailableException('回执入队失败，请稍后重试')
        }
        // this.dedupe.add(key)
        // this.logger.log(
        //     `回执已入队：msgId=${receipt.msgId}，msgKeyId=${receipt.msgKeyId}，portKeyId=${receipt.portKeyId}，sendStatus=${receipt.sendStatus}，statusCode=${receipt.statusCode}`
        // )
        // return { msgId: receipt.msgId, duplicate: false }
    }

    private parse(body: string): SimbankWebhookPayload {
        try {
            const input = JSON.parse(body) as Record<string, unknown>
        } catch {
            throw new BadRequestException('回执不是有效的 JSON')
        }
        // let value: Record<string, unknown>
        // try {
        //     value = JSON.parse(body) as Record<string, unknown>
        // } catch {
        //     throw new BadRequestException('回执不是有效的 JSON')
        // }

        // if (isEmpty(fetchVagueKeyword(value.msgId))){ throw new BadRequestException('回执缺少 msgId')}
        // if (!SEND_STATUSES.has(String(value.sendStatus))) throw new BadRequestException('回执 sendStatus 必须是 success 或 failed')
        // return {
        //     msgId,
        //     msgKeyId: optionalKey(value?.msgKeyId),
        //     simbankKeyId: optionalKey(value?.simbankKeyId),
        //     portKeyId: optionalKey(value?.portKeyId),
        //     sendStatus: value.sendStatus as SimbankWebhookPayload['sendStatus'],
        //     statusCode: String(value.statusCode ?? 'UNKNOWN') as SimbankWebhookPayload['statusCode'],
        //     statusMessage: String(value.statusMessage ?? ''),
        //     sendTime: typeof value.sendTime === 'string' ? value.sendTime : new Date().toISOString()
        // }
    }
}

/** 定位字段只随回执传递，不在接口上强校验。写回时用得到再取，缺失不影响入队。 */
function optionalKey(value: unknown): number {
    const key = Number(value)
    return Number.isInteger(key) && key > 0 ? key : 0
}
