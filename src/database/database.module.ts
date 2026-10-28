import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NacosService } from '@wlisfes/chat-web-base-schema/nacos'
import { createMysqlOptions, DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { HOOKS_MYSQL_CONFIG_KEY, HOOKS_MYSQL_ENTITIES } from '@/database/database.constants'

@Global()
@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService, NacosService],
            useFactory: async (configService: ConfigService, nacosService: NacosService) => {
                await nacosService.loadConfig()
                return createMysqlOptions(configService, {
                    configKey: HOOKS_MYSQL_CONFIG_KEY,
                    entities: [...HOOKS_MYSQL_ENTITIES],
                    decimalNumbers: true
                })
            }
        }),
        TypeOrmModule.forFeature([...HOOKS_MYSQL_ENTITIES])
    ],
    providers: [DataBaseService],
    exports: [TypeOrmModule, DataBaseService]
})
export class DatabaseModule {}
