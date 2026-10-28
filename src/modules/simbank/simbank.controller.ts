import { HttpCode, Post, Req, type RawBodyRequest } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { SimbankService } from '@/modules/simbank/simbank.service'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { type Request } from 'express'
import * as SimbankDto from '@/modules/simbank/simbank.dto'

/** SIMBANK 设备回执开放接口：不校验登录态和回执签名，只接收回执并入队。 */
@ApifoxController('回执接收服务-SIMBANK 设备回执')
export class SimbankController {
    constructor(private readonly simbankService: SimbankService) {}

    @Public()
    @HttpCode(200)
    @ApiServiceDecorator(Post('observe/simbank/webhook'), {
        operation: { summary: '接收 SIMBANK 设备发送回执' },
        response: { type: SimbankDto.SimbankWebhookResponseDto, description: '回执已入队或重复回执' }
    })
    public async httpBaseSimbankWebhook(@Req() request: RawBodyRequest<Request>): Promise<SimbankDto.SimbankWebhookResponseDto> {
        return this.simbankService.httpBaseSimbankWebhook({
            body: request.rawBody?.toString('utf8') ?? ''
        })
    }
}
