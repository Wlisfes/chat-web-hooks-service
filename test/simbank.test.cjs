const test = require('node:test')
const assert = require('node:assert/strict')
const { signSimbankWebhook } = require('@wlisfes/chat-web-base-schema/observe')
const { SimbankService } = require('../dist/modules/simbank/simbank.service')
const { SimbankWebhookDedupe } = require('../dist/modules/simbank/simbank.dedupe')
const { resolveHooksSimbankOptions } = require('../dist/modules/simbank/simbank.constants')

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
    return { body, timestamp: String(timestamp), signature: signSimbankWebhook(secret, timestamp, body) }
}

function service({ fail = false } = {}) {
    const published = []
    const rabbitmq = {
        publish: async (exchange, routingKey, payload, options) => {
            if (fail) throw new Error('RabbitMQ 通道尚未就绪')
            published.push({ exchange, routingKey, payload, options })
        }
    }
    return { published, receipts: new SimbankService(rabbitmq) }
}

test('开放接口不校验签名，回执直接入队', async () => {
    const { published, receipts } = service()
    const result = await receipts.httpBaseSimbankWebhook({ body: JSON.stringify(receipt) })
    assert.deepEqual(result, { msgId: 'm1', duplicate: false })
    assert.equal(published.length, 1)
    assert.equal(published[0].exchange, 'chat.sms.simbank.webhook.exchange')
    assert.equal(published[0].routingKey, 'sms.simbank.webhook')
    assert.equal(published[0].options.messageId, 'm1:success')
    assert.deepEqual(published[0].payload, receipt)
})

test('去重窗口内重复回执不重复转发', async () => {
    const { published, receipts } = service()
    await receipts.httpBaseSimbankWebhook(signed())
    const again = await receipts.httpBaseSimbankWebhook(signed())
    assert.equal(again.duplicate, true)
    assert.equal(published.length, 1)
})

test('回执字段不完整时拒绝', async () => {
    const { receipts, published } = service()
    await assert.rejects(() => receipts.httpBaseSimbankWebhook(signed('not json')), /有效的 JSON/)
    const accepted = await receipts.httpBaseSimbankWebhook(
        signed({ ...receipt, msgKeyId: 0, simbankKeyId: undefined, portKeyId: undefined })
    )
    assert.equal(accepted.duplicate, false)
    assert.equal(published.length, 1)
    await assert.rejects(() => receipts.httpBaseSimbankWebhook(signed({ ...receipt, sendStatus: 'submitted' })), /sendStatus/)
    assert.equal(published.length, 1)
})

test('转发失败返回 503 且不记入去重，Observe 重试时可以再次转发', async () => {
    const failing = service({ fail: true })
    await assert.rejects(() => failing.receipts.httpBaseSimbankWebhook(signed()), /稍后重试/)
    const dedupe = new SimbankWebhookDedupe()
    assert.equal(dedupe.has('m1:success'), false)
})

test('去重记录按有效期和上限淘汰', () => {
    let now = 0
    const dedupe = new SimbankWebhookDedupe(100, 2, () => now)
    dedupe.add('a')
    dedupe.add('b')
    dedupe.add('c')
    assert.equal(dedupe.has('a'), false)
    assert.equal(dedupe.has('b'), true)
    now = 100
    assert.equal(dedupe.has('c'), false)
    assert.throws(() => resolveHooksSimbankOptions({}), /simbank\.secret/)
})

test('回执接口路径为 /observe/simbank/webhook，旧路径 /observe/receipt 已移除', async () => {
    const { NestFactory } = require('@nestjs/core')
    const { Module } = require('@nestjs/common')
    const { SimbankController } = require('../dist/modules/simbank/simbank.controller')
    const calls = []
    const simbank = { httpBaseSimbankWebhook: async request => (calls.push(request), { msgId: 'm1', duplicate: false }) }
    class TestModule {}
    Module({ controllers: [SimbankController], providers: [{ provide: SimbankService, useValue: simbank }] })(TestModule)
    const app = await NestFactory.create(TestModule, { rawBody: true, logger: false })
    await app.listen(0, '127.0.0.1')
    const { port } = app.getHttpServer().address()
    try {
        const post = path =>
            fetch(`http://127.0.0.1:${port}${path}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-simbank-webhook-timestamp': '1', 'x-simbank-webhook-signature': 'ab' },
                body: '{"msgId":"m1"}'
            })
        assert.equal((await post('/observe/simbank/webhook')).status, 200)
        assert.equal((await post('/observe/receipt')).status, 404)
        assert.equal(calls.length, 1)
        assert.deepEqual(calls[0], { body: '{"msgId":"m1"}' })
    } finally {
        await app.close()
    }
})

test('回执消费者串行写回，上一条未完成时下一条等待', async () => {
    const { SimbankWebhookConsumer } = require('../dist/modules/simbank/simbank.consumer')
    const order = []
    let release
    const gate = new Promise(resolve => (release = resolve))
    const status = {
        apply: async receipt => {
            order.push('start-' + receipt.msgId)
            if (receipt.msgId === 'a') await gate
            order.push('end-' + receipt.msgId)
            return 'ack'
        }
    }
    const consumer = new SimbankWebhookConsumer({}, status)
    const first = consumer.fetchWebhook({ msgId: 'a' })
    const second = consumer.fetchWebhook({ msgId: 'b' })
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.deepEqual(order, ['start-a'])
    release()
    assert.deepEqual(await Promise.all([first, second]), ['ack', 'ack'])
    assert.deepEqual(order, ['start-a', 'end-a', 'start-b', 'end-b'])
})

test('写回只更新 submitted 记录，成功时补预付并记后付', async () => {
    const { SimbankStatusService } = require('../dist/modules/simbank/simbank.status')
    let where
    let setValues
    const added = []
    const dataSource = {
        transaction: async work => work(dataSource),
        createQueryBuilder: () => {
            const builder = {
                update: () => builder,
                set: values => ((setValues = values), builder),
                where: (sql, params) => ((where = { sql, params }), builder),
                updateEntity: () => builder,
                execute: async () => ({ affected: 1 })
            }
            return builder
        },
        getRepository: () => ({
            findOne: async () => ({
                keyId: 99,
                msgId: 'm1',
                userKeyId: 1,
                simbankKeyId: 2,
                portKeyId: 3,
                payMode: 'postpaid',
                segments: 1,
                cost: 10
            })
        })
    }
    const outbox = { add: async (_manager, billing) => billing && added.push(billing), flush: async () => {} }
    const saved = await new SimbankStatusService(dataSource, outbox).apply({
        msgId: 'm1',
        msgKeyId: 99,
        simbankKeyId: 2,
        portKeyId: 3,
        sendStatus: 'success',
        statusCode: 'OK',
        statusMessage: '',
        sendTime: '2026-10-28T02:00:00.000Z'
    })
    assert.equal(saved, 'ack')
    assert.equal(where.params.submitted, 'submitted')
    assert.equal(where.params.msgId, 'm1')
    assert.equal(setValues.sendStatus, 'success')
    assert.deepEqual(
        added.map(item => item.eventId),
        ['m1:success']
    )
})

test('无法定位的回执直接丢弃，不写库', async () => {
    const { SimbankStatusService } = require('../dist/modules/simbank/simbank.status')
    let called = false
    const dataSource = { transaction: async () => ((called = true), false) }
    assert.equal(await new SimbankStatusService(dataSource, {}).apply({ msgId: 'm1' }), 'ack')
    assert.equal(called, false)
})
