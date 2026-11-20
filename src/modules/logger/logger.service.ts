import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository, Repository } from '@wlisfes/chat-web-base-schema/database'
import { TbSkylineLogger, TbSkylineLoggerResult, TbSkylineSheet } from '@wlisfes/chat-web-base-schema/chat-web-skyline-mysql'
import { type SkylineLoggerPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { HOOKS_SKYLINE_CONNECTION } from '@/database/database.constants'

/** 消费操作日志后写入 Skyline 库。表由 Skyline 拥有，Hooks 不建表。 */
@Injectable()
export class HooksLoggerService {
    private readonly logger = new Logger(HooksLoggerService.name)

    constructor(
        @InjectRepository(TbSkylineLogger, HOOKS_SKYLINE_CONNECTION)
        private readonly loggerRepository: Repository<TbSkylineLogger>,
        @InjectRepository(TbSkylineSheet, HOOKS_SKYLINE_CONNECTION)
        private readonly sheetRepository: Repository<TbSkylineSheet>
    ) {}

    /** 解析菜单快照后写入。入库失败记录后抛出，由消费者拒绝消息并进入死信。 */
    public async record(input: SkylineLoggerPayload): Promise<void> {
        const summary = this.summary(input)
        try {
            const sheet = await this.sheetRepository.findOne({
                where: { permissionCode: input.permissionCode },
                select: { keyId: true, name: true }
            })
            const log = this.loggerRepository.create({
                logId: input.logId,
                serviceName: input.serviceName,
                permissionCode: input.permissionCode,
                sheetKeyId: sheet?.keyId,
                sheetName: sheet?.name,
                resourceType: input.resourceType,
                resourceId: input.resourceId,
                operatorUid: input.operatorUid,
                operatorNumber: input.operatorNumber,
                operatorName: input.operatorName,
                method: input.method,
                url: input.url.slice(0, 512),
                ip: input.ip,
                result: input.result === TbSkylineLoggerResult.FAILURE ? TbSkylineLoggerResult.FAILURE : TbSkylineLoggerResult.SUCCESS,
                message: input.message?.slice(0, 255),
                requestBody: input.requestBody
            })
            await this.loggerRepository.save(log)
            this.logger.log(`操作日志已入库：${summary}`)
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            this.logger.error(`操作日志入库失败，进入死信：${summary}，原因=${reason}`)
            throw error
        }
    }

    private summary(payload?: SkylineLoggerPayload): string {
        return [
            `logId=${payload?.logId}`,
            `serviceName=${payload?.serviceName}`,
            `permissionCode=${payload?.permissionCode}`,
            `resourceId=${payload?.resourceId ?? '-'}`,
            `operator=${payload?.operatorNumber ?? payload?.operatorUid ?? '-'}`,
            `method=${payload?.method}`,
            `url=${payload?.url}`,
            `result=${payload?.result}`
        ].join('，')
    }
}
