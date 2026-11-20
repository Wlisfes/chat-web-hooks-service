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
        try {
            await this.loggerService.record(payload)
            return 'ack'
        } catch {
            return 'reject'
        }
    }
}
