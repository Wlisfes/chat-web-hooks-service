import { type SrmUserBillingPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import * as SrmSchema from '@wlisfes/chat-web-base-schema/chat-web-srm-mysql'

export type BillingRecord = Pick<
    SrmSchema.TbSrmSimbankMessage,
    'keyId' | 'msgId' | 'userKeyId' | 'simbankKeyId' | 'portKeyId' | 'payMode' | 'segments' | 'cost'
>

/** 预付在受理（submitted）计费，后付在发送成功计费。付款模式缺失时不计费。 */
export function billingTriggerOf(
    payMode: SrmSchema.TbSrmUserPayMode | null | undefined,
    status: SrmSchema.TbSrmSimbankMessageSendStatus
): SrmSchema.TbSrmBillingOutboxTrigger | undefined {
    if (payMode === SrmSchema.TbSrmUserPayMode.PREPAID && status === SrmSchema.TbSrmSimbankMessageSendStatus.SUBMITTED) {
        return SrmSchema.TbSrmBillingOutboxTrigger.SUBMITTED
    }
    if (payMode === SrmSchema.TbSrmUserPayMode.POSTPAID && status === SrmSchema.TbSrmSimbankMessageSendStatus.SUCCESS) {
        return SrmSchema.TbSrmBillingOutboxTrigger.SUCCESS
    }
    return undefined
}

export function createSrmUserBilling(
    record: BillingRecord,
    status: SrmSchema.TbSrmSimbankMessageSendStatus,
    occurredTime: Date
): SrmUserBillingPayload | undefined {
    const trigger = billingTriggerOf(record.payMode, status)
    if (!trigger || !record.msgId) return undefined
    return {
        eventId: `${record.msgId}:${trigger}`,
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
