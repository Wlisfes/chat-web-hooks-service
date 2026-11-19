import { Injectable } from '@nestjs/common'
import { InjectRepository, Repository } from '@wlisfes/chat-web-base-schema/database'
import { TbSkylineLogger, TbSkylineLoggerResult, TbSkylineSheet } from '@wlisfes/chat-web-base-schema/chat-web-skyline-mysql'
import { type SkylineLoggerPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { HOOKS_SKYLINE_CONNECTION } from '@/database/database.constants'

/** 消费操作日志后写入 Skyline 库。表由 Skyline 拥有，Hooks 不建表。 */
@Injectable()
export class HooksLoggerService {
    constructor(
        @InjectRepository(TbSkylineLogger, HOOKS_SKYLINE_CONNECTION)
        private readonly loggerRepository: Repository<TbSkylineLogger>,
        @InjectRepository(TbSkylineSheet, HOOKS_SKYLINE_CONNECTION)
        private readonly sheetRepository: Repository<TbSkylineSheet>
    ) {}

    /** 解析菜单快照后写入。入库失败抛出，由消费者拒绝消息并进入死信。 */
    public async record(input: SkylineLoggerPayload): Promise<void> {
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
    }
}
