import * as SrmSchema from '@wlisfes/chat-web-base-schema/chat-web-srm-mysql'

/** Hooks 读写 SRM 设备短信记录和计费发件箱，表由 SRM 拥有，Hooks 不建表。 */
export const HOOKS_MYSQL_CONFIG_KEY = 'database.chat-web-srm'

export const HOOKS_MYSQL_ENTITIES = [SrmSchema.TbSrmSimbankMessage, SrmSchema.TbSrmBillingOutbox] as const
