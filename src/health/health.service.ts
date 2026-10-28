import { Injectable } from '@nestjs/common'
import { InjectDataSource, DataSource } from '@wlisfes/chat-web-base-schema/database'
import { RabbitmqService } from '@wlisfes/chat-web-base-schema/rabbitmq'
import * as HealthDto from '@/health/dto/health.dto'

type TableRow = { tableName: string }

@Injectable()
export class HealthService {
    constructor(
        private readonly rabbitmqService: RabbitmqService,
        @InjectDataSource() private readonly dataSource: DataSource
    ) {}

    public async getLiveness(): Promise<HealthDto.ServiceLivenessResponseDto> {
        return { status: 'UP', timestamp: new Date().toISOString() }
    }

    /** 回执要入队并写回发送记录，RabbitMQ 或数据库未就绪时不接收回执。 */
    public async getReadiness(): Promise<HealthDto.ServiceReadinessResponseDto> {
        const rabbitmqConnected = this.rabbitmqService.isReady()
        const database = await this.databaseStatus()
        const databaseReady = database.connected === true && (database.missingTables?.length ?? 0) === 0
        return {
            status: rabbitmqConnected && databaseReady ? 'UP' : 'DOWN',
            rabbitmq: { connected: rabbitmqConnected },
            database,
            auth: { mode: 'gateway-principal' },
            timestamp: new Date().toISOString()
        }
    }

    private async databaseStatus(): Promise<HealthDto.ServiceDependencyResponseDto> {
        const requiredTables = [...new Set(this.dataSource.entityMetadatas.map(metadata => metadata.tableName))].sort()
        try {
            if (requiredTables.length === 0) {
                await this.dataSource.query('SELECT 1')
                return { connected: this.dataSource.isInitialized, requiredTableCount: 0, missingTables: [] }
            }
            const rows = (await this.dataSource.query(
                `SELECT table_name AS tableName FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name IN (${requiredTables.map(() => '?').join(', ')})`,
                requiredTables
            )) as TableRow[]
            const existing = new Set(rows.map(row => row.tableName))
            const missingTables = requiredTables.filter(table => !existing.has(table))
            return { connected: this.dataSource.isInitialized, requiredTableCount: requiredTables.length, missingTables }
        } catch (error) {
            return { connected: false, error: error instanceof Error ? error.message : String(error) }
        }
    }
}
