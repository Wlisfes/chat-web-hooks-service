import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { DataSource, EntityManager, In, InjectDataSource } from '@wlisfes/chat-web-base-schema/database'
import {
    RabbitmqService,
    SMS_BILLING_EXCHANGE,
    SMS_SRM_USER_BILLING_ROUTING_KEY,
    type SrmUserBillingPayload
} from '@wlisfes/chat-web-base-schema/rabbitmq'
import { toOutboxRow } from '@/modules/simbank/simbank.billing'
import * as SrmSchema from '@wlisfes/chat-web-base-schema/chat-web-srm-mysql'

const FLUSH_INTERVAL_MS = 10_000
const FLUSH_BATCH = 200
const ERROR_MAX_LENGTH = 512

/** 计费事件发件箱：和发送状态写在同一事务里，提交后发布。发布失败由定时补发，Finance 按 eventId 幂等。 */
@Injectable()
export class SimbankBillingOutbox implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(SimbankBillingOutbox.name)
    private timer?: NodeJS.Timeout
    private flushing?: Promise<void>

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly rabbitmqService: RabbitmqService
    ) {}

    public onApplicationBootstrap(): void {
        this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS)
        this.timer.unref()
    }

    public onApplicationShutdown(): void {
        if (this.timer) clearInterval(this.timer)
    }

    public async add(manager: EntityManager, billing: SrmUserBillingPayload | undefined): Promise<void> {
        if (!billing) return
        await manager
            .createQueryBuilder()
            .insert()
            .into(SrmSchema.TbSrmBillingOutbox)
            .values(toOutboxRow(billing))
            .orIgnore()
            .updateEntity(false)
            .execute()
    }

    public async flush(): Promise<void> {
        this.flushing ??= this.publishPending().finally(() => (this.flushing = undefined))
        return this.flushing
    }

    private async publishPending(): Promise<void> {
        const repository = this.dataSource.getRepository(SrmSchema.TbSrmBillingOutbox)
        let rows: SrmSchema.TbSrmBillingOutbox[]
        try {
            rows = await repository.find({
                where: { status: SrmSchema.TbSrmBillingOutboxStatus.PENDING },
                order: { keyId: 'ASC' },
                take: FLUSH_BATCH
            })
        } catch (error) {
            this.logger.error(`读取计费事件发件箱失败：${error instanceof Error ? error.message : String(error)}`)
            return
        }
        const published: number[] = []
        for (const row of rows) {
            try {
                const billing = JSON.parse(row.payload) as SrmUserBillingPayload
                await this.rabbitmqService.publish(SMS_BILLING_EXCHANGE, SMS_SRM_USER_BILLING_ROUTING_KEY, billing, {
                    messageId: row.eventId
                })
                published.push(row.keyId)
            } catch (error) {
                const message = (error instanceof Error ? error.message : String(error)).slice(0, ERROR_MAX_LENGTH)
                this.logger.warn(`计费事件发布失败，等待补发：eventId=${row.eventId}，原因=${message}`)
                await repository.update({ keyId: row.keyId }, { attempts: row.attempts + 1, lastError: message }).catch(() => undefined)
            }
        }
        if (published.length === 0) return
        await repository
            .update({ keyId: In(published) }, { status: SrmSchema.TbSrmBillingOutboxStatus.PUBLISHED, publishedTime: new Date() })
            .catch(error => this.logger.error(`标记计费事件已发布失败：${error instanceof Error ? error.message : String(error)}`))
    }
}
