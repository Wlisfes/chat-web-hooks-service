import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { RabbitmqService, SKYLINE_LOGGER_QUEUE, type SkylineLoggerPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { HooksLoggerService } from '@/modules/logger/logger.service'

/** 操作日志消费者：各服务入口只负责入队，这里写入 tb_skyline_logger。 */
@Injectable()
export class HooksLoggerConsumer implements OnApplicationBootstrap {
    private readonly logger = new Logger(HooksLoggerConsumer.name)

    constructor(
        private readonly rabbitmqService: RabbitmqService,
        private readonly loggerService: HooksLoggerService
    ) {}

    public async onApplicationBootstrap(): Promise<void> {
        await this.rabbitmqService.consume<SkylineLoggerPayload>(SKYLINE_LOGGER_QUEUE, async payload => this.fetchRecord(payload))
        this.logger.log(`已订阅操作日志队列：${SKYLINE_LOGGER_QUEUE}`)
    }

    /** 写入一条操作日志。入库失败拒绝消息，由队列死信保留供排查。 */
    public async fetchRecord(payload: SkylineLoggerPayload): Promise<'ack' | 'reject'> {
        const summary = this.summary(payload)
        try {
            await this.loggerService.record(payload)
            this.logger.log(`操作日志已入库：${summary}`)
            return 'ack'
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            this.logger.error(`操作日志入库失败，进入死信：${summary}，原因=${reason}`)
            return 'reject'
        }
    }

    private summary(payload?: SkylineLoggerPayload): string {
        return [
            `logId=${payload?.logId}`,
            `serviceName=${payload?.serviceName}`,
            `permissionCode=${payload?.permissionCode}`,
            `resourceId=${payload?.resourceId ?? '-'}`,
            `operator=${payload?.operatorNumber ?? payload?.operatorUid ?? '-'}`,
            `method=${payload?.method}`,
            `url=${payload?.url}`,
            `result=${payload?.result}`
        ].join('，')
    }
}