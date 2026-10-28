import { Injectable, Logger } from '@nestjs/common'
import { DataSource, InjectDataSource } from '@wlisfes/chat-web-base-schema/database'
import { type SimbankWebhookPayload } from '@wlisfes/chat-web-base-schema/observe'
import { createSrmUserBilling } from '@/modules/simbank/simbank.billing'
import { SimbankBillingOutbox } from '@/modules/simbank/simbank.outbox'
import * as SrmSchema from '@wlisfes/chat-web-base-schema/chat-web-srm-mysql'

const STATUS_MESSAGE_MAX_LENGTH = 512
const BILLING_SELECT = {
    keyId: true,
    msgId: true,
    userKeyId: true,
    simbankKeyId: true,
    portKeyId: true,
    payMode: true,
    segments: true,
    cost: true
} as const

const RECEIPT_SEND_STATUS = {
    success: SrmSchema.TbSrmSimbankMessageSendStatus.SUCCESS,
    failed: SrmSchema.TbSrmSimbankMessageSendStatus.FAILED,
    delivered: SrmSchema.TbSrmSimbankMessageSendStatus.DELIVERED
} as const

type ReceiptSendStatus = keyof typeof RECEIPT_SEND_STATUS

/**
 * 按回执写回发送状态。
 * success、failed 只更新仍为 submitted 的记录；delivered 可以晚到，允许从 submitted 或 success 写成已送达，不覆盖失败结果。
 * 计费只发生在首次离开 submitted 时：预付补写受理计费，后付在 success 时计费。delivered 不再计费。
 */
@Injectable()
export class SimbankStatusService {
    private readonly logger = new Logger(SimbankStatusService.name)

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly billingOutbox: SimbankBillingOutbox
    ) {}

    public async apply(receipt: Partial<SimbankWebhookPayload> | undefined): Promise<'ack'> {
        const keyId = Number(receipt?.msgKeyId)
        const msgId = typeof receipt?.msgId === 'string' ? receipt.msgId.trim() : ''
        const receiptStatus = this.receiptStatus(receipt?.sendStatus)
        if (!msgId || !Number.isInteger(keyId) || keyId <= 0 || !receiptStatus) {
            this.logger.warn(`设备回执无法写回，已丢弃：${JSON.stringify(receipt)}`)
            return 'ack'
        }
        const sendStatus = RECEIPT_SEND_STATUS[receiptStatus]
        const sendTime = parseTime(receipt?.sendTime)
        const saved = await this.complete(keyId, msgId, {
            sendStatus,
            statusCode: String(receipt?.statusCode ?? 'UNKNOWN'),
            statusMessage: String(receipt?.statusMessage ?? ''),
            sendTime
        })
        const summary = `msgId=${msgId}，msgKeyId=${keyId}，portKeyId=${receipt?.portKeyId}，sendStatus=${sendStatus}，statusCode=${receipt?.statusCode}`
        if (!saved) this.logger.warn(`设备回执未写入，记录状态已变更或不匹配：${summary}`)
        else if (sendStatus === SrmSchema.TbSrmSimbankMessageSendStatus.SUCCESS) this.logger.log(`短信发送成功：${summary}`)
        else if (sendStatus === SrmSchema.TbSrmSimbankMessageSendStatus.DELIVERED) this.logger.log(`短信已送达：${summary}`)
        else this.logger.warn(`短信发送失败：${summary}，原因=${receipt?.statusMessage}`)
        return 'ack'
    }

    private receiptStatus(value: unknown): ReceiptSendStatus | undefined {
        return value === 'success' || value === 'failed' || value === 'delivered' ? value : undefined
    }

    private async complete(
        keyId: number,
        msgId: string,
        outcome: { sendStatus: SrmSchema.TbSrmSimbankMessageSendStatus; statusCode: string; statusMessage: string; sendTime: Date }
    ): Promise<boolean> {
        const fromStatuses =
            outcome.sendStatus === SrmSchema.TbSrmSimbankMessageSendStatus.DELIVERED
                ? [SrmSchema.TbSrmSimbankMessageSendStatus.SUBMITTED, SrmSchema.TbSrmSimbankMessageSendStatus.SUCCESS]
                : [SrmSchema.TbSrmSimbankMessageSendStatus.SUBMITTED]
        const saved = await this.dataSource.transaction(async manager => {
            const result = await manager
                .createQueryBuilder()
                .update(SrmSchema.TbSrmSimbankMessage)
                .set({
                    sendStatus: outcome.sendStatus,
                    statusCode: outcome.statusCode.slice(0, 32),
                    statusMessage: outcome.statusMessage.slice(0, STATUS_MESSAGE_MAX_LENGTH),
                    sendTime: outcome.sendTime
                })
                .where('keyId = :keyId AND msgId = :msgId AND sendStatus IN (:...fromStatuses)', { keyId, msgId, fromStatuses })
                .updateEntity(false)
                .execute()
            if (!result.affected) return false
            if (outcome.sendStatus === SrmSchema.TbSrmSimbankMessageSendStatus.DELIVERED) return true
            const snapshot = await manager
                .getRepository(SrmSchema.TbSrmSimbankMessage)
                .findOne({ where: { keyId }, select: BILLING_SELECT })
            if (!snapshot) return true
            await this.billingOutbox.add(
                manager,
                createSrmUserBilling(snapshot, SrmSchema.TbSrmSimbankMessageSendStatus.SUBMITTED, outcome.sendTime)
            )
            if (outcome.sendStatus === SrmSchema.TbSrmSimbankMessageSendStatus.SUCCESS) {
                await this.billingOutbox.add(manager, createSrmUserBilling(snapshot, outcome.sendStatus, outcome.sendTime))
            }
            return true
        })
        if (saved) void this.billingOutbox.flush()
        return saved
    }
}

function parseTime(value: unknown): Date {
    const time = typeof value === 'string' ? new Date(value) : undefined
    return time && !Number.isNaN(time.getTime()) ? time : new Date()
}
