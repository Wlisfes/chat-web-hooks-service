import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { type SimbankWebhookPayload } from '@wlisfes/chat-web-base-schema/observe'
import { RabbitmqService, SMS_SIMBANK_WEBHOOK_EXCHANGE, SMS_SIMBANK_WEBHOOK_ROUTING_KEY } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { SimbankWebhookDedupe } from '@/modules/simbank/simbank.dedupe'
import * as SimbankDto from '@/modules/simbank/simbank.dto'

/**
 * 开放接口：不校验登录态和签名，字段由 DTO 校验（msgId、sendStatus 必填，定位字段可缺省）。
 * 按 msgId + sendStatus 去重后入队，写回发送状态由队列消费者逐条处理。入队失败返回 503，调用方按退避间隔重试。
 */
@Injectable()
export class SimbankService {
    private readonly logger = new Logger(SimbankService.name)
    private readonly dedupe = new SimbankWebhookDedupe()

    constructor(private readonly rabbitmqService: RabbitmqService) {}

    /**接收 SIMBANK 设备发送回执**/
    public async httpBaseSimbankWebhook(body: SimbankDto.SimbankWebhookDto): Promise<SimbankDto.SimbankWebhookResponseDto> {
        const input = this.toPayload(body)
        const key = `${input.msgId}:${input.sendStatus}`
        if (this.dedupe.has(key)) {
            return { msgId: input.msgId, duplicate: true }
        }
        try {
            await this.rabbitmqService.publish(SMS_SIMBANK_WEBHOOK_EXCHANGE, SMS_SIMBANK_WEBHOOK_ROUTING_KEY, input, { messageId: key })
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            this.logger.error(`回执入队失败，等待重试：msgId=${input.msgId}，原因=${reason}`)
            throw new ServiceUnavailableException('回执入队失败，请稍后重试')
        }
        this.dedupe.add(key)
        return { msgId: input.msgId, duplicate: false }
    }

    /** DTO 转为回执队列消息：缺省的定位字段记为 0，写回时按 msgId + msgKeyId 定位，缺失则丢弃。 */
    public toPayload(body: SimbankDto.SimbankWebhookDto): SimbankWebhookPayload {
        return {
            msgId: body.msgId.trim(),
            msgKeyId: body.msgKeyId ?? 0,
            simbankKeyId: body.simbankKeyId ?? 0,
            portKeyId: body.portKeyId ?? 0,
            sendStatus: body.sendStatus as SimbankWebhookPayload['sendStatus'],
            statusCode: (body.statusCode ?? 'UNKNOWN') as SimbankWebhookPayload['statusCode'],
            statusMessage: body.statusMessage ?? '',
            sendTime: body.sendTime ?? new Date().toISOString()
        }
    }
}
