import { Module } from '@nestjs/common'
import { HooksLoggerConsumer } from '@/modules/logger/logger.consumer'
import { HooksLoggerService } from '@/modules/logger/logger.service'

/** 消费操作日志队列并写入 Skyline 库。 */
@Module({
    providers: [HooksLoggerService, HooksLoggerConsumer]
})
export class HooksLoggerModule {}
