import { Module } from '@nestjs/common'
import { SimbankController } from '@/modules/simbank/simbank.controller'
import { SimbankService } from '@/modules/simbank/simbank.service'

/** SIMBANK 设备回执模块：校验签名、去重后转发到回执队列。 */
@Module({
    controllers: [SimbankController],
    providers: [SimbankService]
})
export class SimbankModule {}
