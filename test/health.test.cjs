const test = require('node:test')
const assert = require('node:assert/strict')
const { HealthService } = require('../dist/health/health.service')
const { AppService } = require('../dist/app.service')

test('RabbitMQ 未就绪时就绪检查返回 DOWN', async () => {
    const down = await new HealthService({ isReady: () => false }).getReadiness()
    assert.equal(down.status, 'DOWN')
    const up = await new HealthService({ isReady: () => true }).getReadiness()
    assert.equal(up.status, 'UP')
    assert.equal((await new HealthService({}).getLiveness()).status, 'UP')
})

test('服务信息返回回执接收服务名称', async () => {
    const service = new AppService({})
    assert.equal(await service.httpBaseHooksResolverService(), 'Chat Web Hooks Service')
})
