import { Body, HttpCode, Post } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { SimbankService } from '@/modules/simbank/simbank.service'
import * as SimbankDto from '@/modules/simbank/simbank.dto'

/**
 * SIMBANK 设备回执开放接口：不校验登录态和签名，只接收回执并入队。
 * 外部经网关访问 /api/hooks/observe/simbank/webhook（网关公开路径），Docker 内的 Observe 直接访问 /observe/simbank/webhook。
 */
@ApifoxController('回执接收服务-SIMBANK 设备回执')
export class SimbankController {
    constructor(private readonly simbankService: SimbankService) {}

    @Public()
    @HttpCode(200)
    @ApiServiceDecorator(Post('observe/simbank/webhook'), {
        operation: { summary: '接收 SIMBANK 设备发送回执' },
        response: { type: SimbankDto.SimbankWebhookResponseDto, description: '回执已入队或重复回执' }
    })
    public async httpBaseSimbankWebhook(@Body() body: SimbankDto.SimbankWebhookDto): Promise<SimbankDto.SimbankWebhookResponseDto> {
        return this.simbankService.httpBaseSimbankWebhook(body)
    }
}
