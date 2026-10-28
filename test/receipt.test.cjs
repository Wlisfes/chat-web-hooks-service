const test = require('node:test')
const assert = require('node:assert/strict')
const { signObserveReceipt } = require('@wlisfes/chat-web-base-schema/observe')
const { ReceiptService } = require('../dist/modules/receipt/receipt.service')
const { ReceiptDedupe } = require('../dist/modules/receipt/receipt.dedupe')
const { resolveHooksObserveOptions } = require('../dist/modules/receipt/receipt.constants')

const receipt = {
    msgId: 'm1',
    msgKeyId: 99,
    simbankKeyId: 3001,
    portKeyId: 2001,
    sendStatus: 'success',
    statusCode: 'OK',
    statusMessage: '模拟设备发送成功',
    sendTime: '2026-10-28T02:00:00.000Z'
}

function signed(payload = receipt, secret = 'secret', timestamp = Date.now()) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    return { body, timestamp: String(timestamp), signature: signObserveReceipt(secret, timestamp, body) }
}

function service({ secret = 'secret', fail = false } = {}) {
    const published = []
    const rabbitmq = {
        publish: async (exchange, routingKey, payload, options) => {
            if (fail) throw new Error('RabbitMQ 通道尚未就绪')
            published.push({ exchange, routingKey, payload, options })
        }
    }
    return { published, receipts: new ReceiptService({ get: () => (secret ? { secret } : undefined) }, rabbitmq) }
}

test('签名有效的回执转发到回执队列', async () => {
    const { published, receipts } = service()
    const result = await receipts.acceptObserveReceipt(signed())
    assert.deepEqual(result, { msgId: 'm1', duplicate: false })
    assert.equal(published.length, 1)
    assert.equal(published[0].exchange, 'chat.sms.receipt.exchange')
    assert.equal(published[0].routingKey, 'sms.receipt.observe')
    assert.equal(published[0].options.messageId, 'm1:success')
    assert.deepEqual(published[0].payload, receipt)
})

test('去重窗口内重复回执不重复转发', async () => {
    const { published, receipts } = service()
    await receipts.acceptObserveReceipt(signed())
    const again = await receipts.acceptObserveReceipt(signed())
    assert.equal(again.duplicate, true)
    assert.equal(published.length, 1)
})

test('签名错误、过期或未配置密钥时拒绝', async () => {
    const { receipts } = service()
    await assert.rejects(() => receipts.acceptObserveReceipt(signed(receipt, 'other')), /签名无效/)
    await assert.rejects(() => receipts.acceptObserveReceipt(signed(receipt, 'secret', Date.now() - 10 * 60 * 1000)), /签名无效/)
    await assert.rejects(() => receipts.acceptObserveReceipt({ body: JSON.stringify(receipt) }), /签名无效/)
    await assert.rejects(() => service({ secret: '' }).receipts.acceptObserveReceipt(signed()), /签名未配置/)
})

test('回执字段不完整时拒绝', async () => {
    const { receipts, published } = service()
    await assert.rejects(() => receipts.acceptObserveReceipt(signed('not json')), /有效的 JSON/)
    await assert.rejects(() => receipts.acceptObserveReceipt(signed({ ...receipt, msgKeyId: 0 })), /缺少/)
    await assert.rejects(() => receipts.acceptObserveReceipt(signed({ ...receipt, sendStatus: 'submitted' })), /sendStatus/)
    assert.equal(published.length, 0)
})

test('转发失败返回 503 且不记入去重，Observe 重试时可以再次转发', async () => {
    const failing = service({ fail: true })
    await assert.rejects(() => failing.receipts.acceptObserveReceipt(signed()), /稍后重试/)
    const dedupe = new ReceiptDedupe()
    assert.equal(dedupe.has('m1:success'), false)
})

test('去重记录按有效期和上限淘汰', () => {
    let now = 0
    const dedupe = new ReceiptDedupe(100, 2, () => now)
    dedupe.add('a')
    dedupe.add('b')
    dedupe.add('c')
    assert.equal(dedupe.has('a'), false)
    assert.equal(dedupe.has('b'), true)
    now = 100
    assert.equal(dedupe.has('c'), false)
    assert.throws(() => resolveHooksObserveOptions({}), /observe\.secret/)
})
