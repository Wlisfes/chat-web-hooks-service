import 'dotenv/config'
import express from 'express'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { setupSwagger } from '@wlisfes/chat-web-base-schema'
import { ReadableConsoleLogger, createRequestLoggingMiddleware } from '@wlisfes/chat-web-base-schema/logging'
import { requestContextMiddleware } from '@wlisfes/chat-web-base-schema/request-context'
import { AppModule } from '@/app.module'

const logger = new ReadableConsoleLogger({
    NODE_ENV: process.env.NODE_ENV,
    prefix: process.env.NACOS_SERVICE_NAME
})

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger })
    app.enableShutdownHooks()
    // 回执验签需要请求原文。setupSwagger 会在 Nest 初始化前注册 express.json()，导致 Nest 的 rawBody 解析器拿不到原文；
    // 这里最先注册一个保留原文的 JSON 解析器，后续解析器发现请求体已解析会直接跳过。
    app.use(express.json({ verify: (request, _response, buffer) => ((request as { rawBody?: Buffer }).rawBody = Buffer.from(buffer)) }))
    app.use(requestContextMiddleware)
    app.use(createRequestLoggingMiddleware(process.env.NACOS_SERVICE_NAME))
    return await setupSwagger(app, {
        title: 'Chat Web Hooks 服务 API',
        description: '回执接收服务：接收设备侧发送回执并转发到消息队列',
        port: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV ?? 'development'
    }).then(async event => {
        logger.log(`Chat Web Hooks 服务启动[${event.NODE_ENV}]：http://127.0.0.1:${event.port}`)
        logger.log(`Swagger 文档：http://127.0.0.1:${event.port}/api/swagger`)
    })
}

void bootstrap().catch(error => {
    logger.error(error, 'Bootstrap')
    process.exitCode = 1
})
