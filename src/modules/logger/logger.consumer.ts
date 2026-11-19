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
        await this.rabbitmqService.consume<SkylineLoggerPayload>(SKYLINE_LOGGER_QUEUE, async payload => {
            await this.loggerService.record(payload)
            return 'ack'
        })
        this.logger.log(`已订阅操作日志队列：${SKYLINE_LOGGER_QUEUE}`)
    }
}
