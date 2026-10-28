const test = require('node:test')
const assert = require('node:assert/strict')
const { SimbankService } = require('../dist/modules/simbank/simbank.service')
const { SimbankWebhookDedupe } = require('../dist/modules/simbank/simbank.dedupe')

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
    const result = await receipts.httpBaseSimbankWebhook(receipt)
    assert.deepEqual(result, { msgId: 'm1', duplicate: false })
    assert.equal(published.length, 1)
    assert.equal(published[0].exchange, 'chat.sms.simbank.webhook.exchange')
    assert.equal(published[0].routingKey, 'sms.simbank.webhook')
    assert.equal(published[0].options.messageId, 'm1:success')
    assert.deepEqual(published[0].payload, receipt)
})

test('去重窗口内重复回执不重复转发', async () => {
    const { published, receipts } = service()
    await receipts.httpBaseSimbankWebhook(receipt)
    const again = await receipts.httpBaseSimbankWebhook(receipt)
    assert.equal(again.duplicate, true)
    assert.equal(published.length, 1)
})

test('定位字段缺失时按 0 入队，状态码和发送时间有默认值', async () => {
    const { receipts, published } = service()
    await receipts.httpBaseSimbankWebhook({ msgId: ' m2 ', sendStatus: 'failed' })
    assert.equal(published[0].payload.msgId, 'm2')
    assert.equal(published[0].payload.msgKeyId, 0)
    assert.equal(published[0].payload.statusCode, 'UNKNOWN')
    assert.ok(!Number.isNaN(Date.parse(published[0].payload.sendTime)))
})

test('转发失败返回 503 且不记入去重，Observe 重试时可以再次转发', async () => {
    const failing = service({ fail: true })
    await assert.rejects(() => failing.receipts.httpBaseSimbankWebhook(receipt), /稍后重试/)
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
})

test('回执接口开放访问：不需要签名头，DTO 校验必填字段，旧路径已移除', async () => {
    const { NestFactory } = require('@nestjs/core')
    const { Module, ValidationPipe } = require('@nestjs/common')
    const { SimbankController } = require('../dist/modules/simbank/simbank.controller')
    const calls = []
    const simbank = { httpBaseSimbankWebhook: async body => (calls.push(body), { msgId: body.msgId, duplicate: false }) }
    class TestModule {}
    Module({ controllers: [SimbankController], providers: [{ provide: SimbankService, useValue: simbank }] })(TestModule)
    const app = await NestFactory.create(TestModule, { logger: false })
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
    await app.listen(0, '127.0.0.1')
    const { port } = app.getHttpServer().address()
    try {
        const post = (path, body) =>
            fetch(`http://127.0.0.1:${port}${path}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body)
            })
        assert.equal((await post('/simbank/webhook', { msgId: 'm1', sendStatus: 'success', msgKeyId: '99' })).status, 200)
        assert.equal((await post('/simbank/webhook', { msgId: 'm1', sendStatus: 'submitted' })).status, 400)
        assert.equal((await post('/observe/receipt', { msgId: 'm1', sendStatus: 'success' })).status, 404)
        assert.equal(calls.length, 1)
        assert.equal(calls[0].msgId, 'm1')
        assert.equal(calls[0].msgKeyId, 99, 'msgKeyId 字符串转为数字')
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
    assert.deepEqual(where.params.fromStatuses, ['submitted'])
    assert.equal(where.params.msgId, 'm1')
    assert.equal(setValues.sendStatus, 'success')
    assert.deepEqual(
        added.map(item => item.eventId),
        ['m1']
    )
})

test('无法定位的回执直接丢弃，不写库', async () => {
    const { SimbankStatusService } = require('../dist/modules/simbank/simbank.status')
    let called = false
    const dataSource = { transaction: async () => ((called = true), false) }
    assert.equal(await new SimbankStatusService(dataSource, {}).apply({ msgId: 'm1' }), 'ack')
    assert.equal(called, false)
})

test('送达回执可以覆盖 submitted 或 success，并提交一次扣费', async () => {
    const { SimbankStatusService } = require('../dist/modules/simbank/simbank.status')
    let where
    let added = 0
    const dataSource = {
        transaction: async work => work(dataSource),
        getRepository: () => ({
            findOne: async () => ({
                keyId: 99,
                msgId: 'm1',
                userKeyId: 1,
                payMode: 'postpaid',
                segments: 1,
                cost: 10,
                simbankKeyId: 2,
                portKeyId: 3
            })
        }),
        createQueryBuilder: () => {
            const builder = {
                update: () => builder,
                set: () => builder,
                where: (sql, params) => ((where = { sql, params }), builder),
                updateEntity: () => builder,
                execute: async () => ({ affected: 1 })
            }
            return builder
        }
    }
    const outbox = { add: async () => added++, flush: async () => {} }
    await new SimbankStatusService(dataSource, outbox).apply({
        msgId: 'm1',
        msgKeyId: 99,
        sendStatus: 'delivered',
        statusCode: 'DELIVERED',
        sendTime: '2026-10-28T03:00:00.000Z'
    })
    assert.deepEqual(where.params.fromStatuses, ['submitted', 'success'])
    assert.equal(added, 1)
})
