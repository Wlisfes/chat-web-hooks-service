import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthorizationGuard, AuthorizationModule, GatewayPrincipalGuard, GatewayPrincipalModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RabbitmqModule, setupObserveReceiptTopology } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { HealthModule } from '@/health/health.module'
import { HOOKS_RABBITMQ_VHOST } from '@/modules/receipt/receipt.constants'
import { ReceiptModule } from '@/modules/receipt/receipt.module'

/** 回执接收服务：接收 Observe 等设备侧的发送回执，校验签名、去重后转发到回执队列。不连接数据库。 */
@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        RabbitmqModule.forRoot({ vhost: HOOKS_RABBITMQ_VHOST, setup: setupObserveReceiptTopology }),
        GatewayPrincipalModule,
        AuthorizationModule,
        HealthModule,
        ReceiptModule
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useExisting: GatewayPrincipalGuard },
        { provide: APP_GUARD, useExisting: AuthorizationGuard }
    ]
})
export class AppModule {}
