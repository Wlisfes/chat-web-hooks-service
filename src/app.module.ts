import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthorizationGuard, AuthorizationModule, GatewayPrincipalGuard, GatewayPrincipalModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RabbitmqModule, setupSimbankWebhookTopology, setupSrmUserBillingTopology } from '@wlisfes/chat-web-base-schema/rabbitmq'
import type { ConfirmChannel } from 'amqplib'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { DatabaseModule } from '@/database/database.module'
import { HealthModule } from '@/health/health.module'
import { HOOKS_RABBITMQ_VHOST } from '@/modules/simbank/simbank.constants'
import { SimbankModule } from '@/modules/simbank/simbank.module'

/** 回执入队后由本服务串行写回发送状态，并带上原来绑在写回上的供应商计费事件。 */
async function setupHooksTopology(channel: ConfirmChannel): Promise<void> {
    await setupSimbankWebhookTopology(channel)
    await setupSrmUserBillingTopology(channel)
}

/** 回执接收服务：接收设备回执后入队，再逐条写回发送状态。 */
@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        RabbitmqModule.forRoot({ vhost: HOOKS_RABBITMQ_VHOST, setup: setupHooksTopology }),
        DatabaseModule,
        GatewayPrincipalModule,
        AuthorizationModule,
        HealthModule,
        SimbankModule
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useExisting: GatewayPrincipalGuard },
        { provide: APP_GUARD, useExisting: AuthorizationGuard }
    ]
})
export class AppModule {}
