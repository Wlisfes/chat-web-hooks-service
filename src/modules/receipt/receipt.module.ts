import { Module } from '@nestjs/common'
import { ReceiptController } from '@/modules/receipt/receipt.controller'
import { ReceiptService } from '@/modules/receipt/receipt.service'

/** 设备回执模块：校验签名、去重后转发到回执队列。 */
@Module({
    controllers: [ReceiptController],
    providers: [ReceiptService]
})
export class ReceiptModule {}
