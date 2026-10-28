import { type SrmUserBillingPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import * as SrmSchema from '@wlisfes/chat-web-base-schema/chat-web-srm-mysql'

export type BillingRecord = Pick<
    SrmSchema.TbSrmSimbankMessage,
    'keyId' | 'msgId' | 'userKeyId' | 'simbankKeyId' | 'portKeyId' | 'payMode' | 'segments' | 'cost'
>

/** 先付、后付都在发送成功或已送达时扣费。付款模式缺失或仍是提交成功时不扣费。 */
export function billingTriggerOf(
    payMode: SrmSchema.TbSrmUserPayMode | null | undefined,
    status: SrmSchema.TbSrmSimbankMessageSendStatus
): SrmSchema.TbSrmBillingOutboxTrigger | undefined {
    if (!payMode) return undefined
    if (status !== SrmSchema.TbSrmSimbankMessageSendStatus.SUCCESS && status !== SrmSchema.TbSrmSimbankMessageSendStatus.DELIVERED)
        return undefined
    return SrmSchema.TbSrmBillingOutboxTrigger.SUCCESS
}

export function createSrmUserBilling(
    record: BillingRecord,
    status: SrmSchema.TbSrmSimbankMessageSendStatus,
    occurredTime: Date
): SrmUserBillingPayload | undefined {
    const trigger = billingTriggerOf(record.payMode, status)
    if (!trigger || !record.msgId) return undefined
    return {
        eventId: record.msgId,
        msgId: record.msgId,
        msgKeyId: record.keyId,
        userKeyId: record.userKeyId,
        simbankKeyId: record.simbankKeyId,
        portKeyId: record.portKeyId,
        payMode: record.payMode,
        trigger,
        segments: record.segments,
        costUsd: Number(record.cost) || 0,
        occurredTime: occurredTime.toISOString()
    }
}

export function toOutboxRow(billing: SrmUserBillingPayload): Partial<SrmSchema.TbSrmBillingOutbox> {
    return {
        eventId: billing.eventId,
        msgId: billing.msgId,
        trigger: billing.trigger as SrmSchema.TbSrmBillingOutboxTrigger,
        payload: JSON.stringify(billing),
        status: SrmSchema.TbSrmBillingOutboxStatus.PENDING,
        attempts: 0
    }
}
