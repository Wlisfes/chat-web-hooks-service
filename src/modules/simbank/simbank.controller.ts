import { Body, HttpCode, Post } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { SimbankService } from '@/modules/simbank/simbank.service'
import * as SimbankDto from '@/modules/simbank/simbank.dto'

/**
 * SIMBANK 设备回执开放接口：不校验登录态和签名，只接收回执并入队。
 * 外部和 Observe 都经网关访问 /api/observe/simbank/webhook；网关去掉 /api/observe 后转发到本接口。
 */
@ApifoxController('回执接收服务-SIMBANK 设备回执')
export class SimbankController {
    constructor(private readonly simbankService: SimbankService) {}

    @Public()
    @HttpCode(200)
    @ApiServiceDecorator(Post(['simbank/webhook', 'observe/simbank/webhook']), {
        operation: { summary: '接收 SIMBANK 设备发送回执' },
        response: { type: SimbankDto.SimbankWebhookResponseDto, description: '回执已入队或重复回执' }
    })
    public async httpBaseSimbankWebhook(@Body() body: SimbankDto.SimbankWebhookDto): Promise<SimbankDto.SimbankWebhookResponseDto> {
        return this.simbankService.httpBaseSimbankWebhook(body)
    }
}
