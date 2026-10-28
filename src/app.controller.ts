import { Get } from '@nestjs/common'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import { AppService } from '@/app.service'
import * as HealthDto from '@/health/dto/health.dto'

@ApifoxController('回执接收服务-运行状态')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Public()
    @ApiServiceDecorator(Get(), {
        operation: { summary: '查看回执接收服务信息' },
        response: { type: String, description: '回执接收服务名称' }
    })
    public async httpBaseHooksResolverService(): Promise<string> {
        return this.appService.httpBaseHooksResolverService()
    }

    @Public()
    @ApiServiceDecorator(Get('health/live'), {
        operation: { summary: '回执接收服务存活检查' },
        response: { type: HealthDto.ServiceLivenessResponseDto, description: '进程正常时返回 UP' }
    })
    public async httpBaseHooksLiveHealth(): Promise<HealthDto.ServiceLivenessResponseDto> {
        return this.appService.httpBaseHooksLiveHealth()
    }

    @Public()
    @ApiServiceDecorator(Get(['health', 'health/ready']), {
        operation: { summary: '回执接收服务就绪检查' },
        response: { type: HealthDto.ServiceReadinessResponseDto, description: 'RabbitMQ 连接状态' }
    })
    @PreserveHttpStatus()
    public async httpBaseHooksReadyHealth(): Promise<HealthDto.ServiceReadinessResponseDto> {
        return this.appService.httpBaseHooksReadyHealth()
    }
}
