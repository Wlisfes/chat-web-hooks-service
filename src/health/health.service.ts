import { Injectable } from '@nestjs/common'
import { RabbitmqService } from '@wlisfes/chat-web-base-schema/rabbitmq'
import * as HealthDto from '@/health/dto/health.dto'

@Injectable()
export class HealthService {
    constructor(private readonly rabbitmqService: RabbitmqService) {}

    /**回执接收服务存活状态。*/
    public async getLiveness(): Promise<HealthDto.ServiceLivenessResponseDto> {
        return { status: 'UP', timestamp: new Date().toISOString() }
    }

    /**回执接收服务就绪状态：回执要转发到 RabbitMQ，连接未就绪时不接收回执。*/
    public async getReadiness(): Promise<HealthDto.ServiceReadinessResponseDto> {
        const connected = this.rabbitmqService.isReady()
        return {
            status: connected ? 'UP' : 'DOWN',
            rabbitmq: { connected },
            auth: { mode: 'gateway-principal' },
            timestamp: new Date().toISOString()
        }
    }
}
