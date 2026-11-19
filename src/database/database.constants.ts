import * as SkylineSchema from '@wlisfes/chat-web-base-schema/chat-web-skyline-mysql'
import * as SrmSchema from '@wlisfes/chat-web-base-schema/chat-web-srm-mysql'

/** Hooks 读写 SRM 设备短信记录和计费发件箱，表由 SRM 拥有，Hooks 不建表。 */
export const HOOKS_MYSQL_CONFIG_KEY = 'database.chat-web-srm'

export const HOOKS_MYSQL_ENTITIES = [SrmSchema.TbSrmSimbankMessage, SrmSchema.TbSrmBillingOutbox] as const

/** 操作日志表由 Skyline 拥有，Hooks 只消费队列后写入，不建表。 */
export const HOOKS_SKYLINE_CONNECTION = 'chat-web-skyline'
export const HOOKS_SKYLINE_MYSQL_CONFIG_KEY = 'database.chat-web-skyline'
export const HOOKS_SKYLINE_ENTITIES = [SkylineSchema.TbSkylineLogger, SkylineSchema.TbSkylineSheet] as const
