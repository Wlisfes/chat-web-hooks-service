import { HttpCode, Post, Req, type RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { OBSERVE_RECEIPT_SIGNATURE_HEADER, OBSERVE_RECEIPT_TIMESTAMP_HEADER } from '@wlisfes/chat-web-base-schema/observe'
import * as ReceiptDto from '@/modules/receipt/receipt.dto'
import { ReceiptService } from '@/modules/receipt/receipt.service'

/** 设备侧回执入口：Observe 在 Docker 网络内直接调用，不经网关，用 HMAC 签名鉴权。 */
@ApifoxController('回执接收服务-设备回执')
export class ReceiptController {
    constructor(private readonly receiptService: ReceiptService) {}

    @Public()
    @HttpCode(200)
    @ApiServiceDecorator(Post('observe/receipt'), {
        operation: { summary: '接收 Observe 发送回执' },
        response: { type: ReceiptDto.ReceiptAcceptResponseDto, description: '回执已转发或重复回执' }
    })
    public async httpBaseHooksObserveReceipt(@Req() request: RawBodyRequest<Request>): Promise<ReceiptDto.ReceiptAcceptResponseDto> {
        return this.receiptService.acceptObserveReceipt({
            body: request.rawBody?.toString('utf8') ?? '',
            timestamp: request.header(OBSERVE_RECEIPT_TIMESTAMP_HEADER),
            signature: request.header(OBSERVE_RECEIPT_SIGNATURE_HEADER)
        })
    }
}
