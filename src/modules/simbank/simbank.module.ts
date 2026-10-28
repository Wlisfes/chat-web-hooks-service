import { Module } from '@nestjs/common'
import { SimbankBillingOutbox } from '@/modules/simbank/simbank.outbox'
import { SimbankController } from '@/modules/simbank/simbank.controller'
import { SimbankService } from '@/modules/simbank/simbank.service'
import { SimbankStatusService } from '@/modules/simbank/simbank.status'
import { SimbankWebhookConsumer } from '@/modules/simbank/simbank.consumer'

/** SIMBANK 设备回执：接口校验后入队，消费者串行写回发送状态。 */
@Module({
    controllers: [SimbankController],
    providers: [SimbankService, SimbankWebhookConsumer, SimbankStatusService, SimbankBillingOutbox]
})
export class SimbankModule {}
