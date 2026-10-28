const test = require('node:test')
const assert = require('node:assert/strict')
const { HealthService } = require('../dist/health/health.service')
const { AppService } = require('../dist/app.service')

function health(rabbitmqReady, databaseReady = true) {
    return new HealthService(
        { isReady: () => rabbitmqReady },
        {
            isInitialized: databaseReady,
            entityMetadatas: databaseReady ? [{ tableName: 'tb_srm_simbank_message' }] : [],
            query: async () => (databaseReady ? [{ tableName: 'tb_srm_simbank_message' }] : [])
        }
    )
}

test('RabbitMQ 或数据库未就绪时就绪检查返回 DOWN', async () => {
    assert.equal((await health(false).getReadiness()).status, 'DOWN')
    assert.equal((await health(true, false).getReadiness()).status, 'DOWN')
    assert.equal((await health(true).getReadiness()).status, 'UP')
    assert.equal((await health(true).getLiveness()).status, 'UP')
})

test('服务信息返回回执接收服务名称', async () => {
    const service = new AppService({})
    assert.equal(await service.httpBaseHooksResolverService(), 'Chat Web Hooks Service')
})
