import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { RabbitmqService, SMS_SIMBANK_WEBHOOK_QUEUE } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { type SimbankWebhookPayload } from '@wlisfes/chat-web-base-schema/observe'
import { SimbankStatusService } from '@/modules/simbank/simbank.status'

/**
 * 回执消费者：HTTP 接口只负责入队，这里再一条条写回发送状态。
 * 即使 RabbitMQ prefetch 大于 1，本实例也串行处理，避免回执突发时同时改很多条记录。
 */
@Injectable()
export class SimbankWebhookConsumer implements OnApplicationBootstrap {
    private readonly logger = new Logger(SimbankWebhookConsumer.name)
    private tail: Promise<void> = Promise.resolve()

    constructor(
        private readonly rabbitmqService: RabbitmqService,
        private readonly statusService: SimbankStatusService
    ) {}

    public async onApplicationBootstrap(): Promise<void> {
        await this.rabbitmqService.consume<SimbankWebhookPayload>(SMS_SIMBANK_WEBHOOK_QUEUE, async receipt => {
            return this.fetchWebhook(receipt)
        })
        this.logger.log(`已订阅回执队列，串行写回发送状态：${SMS_SIMBANK_WEBHOOK_QUEUE}`)
    }

    public async fetchWebhook(receipt: SimbankWebhookPayload): Promise<'ack'> {
        return await this.oneByOne(() => this.statusService.apply(receipt))
    }

    /** 本实例同时只改一条状态；上一条失败不挡住下一条。 */
    private oneByOne<T>(work: () => Promise<T>): Promise<T> {
        const run = this.tail.then(work, work)
        this.tail = run.then(
            () => undefined,
            () => undefined
        )
        return run
    }
}
