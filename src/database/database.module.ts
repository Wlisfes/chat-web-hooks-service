import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NacosService } from '@wlisfes/chat-web-base-schema/nacos'
import { createMysqlOptions, DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import {
    HOOKS_MYSQL_CONFIG_KEY,
    HOOKS_MYSQL_ENTITIES,
    HOOKS_SKYLINE_CONNECTION,
    HOOKS_SKYLINE_ENTITIES,
    HOOKS_SKYLINE_MYSQL_CONFIG_KEY
} from '@/database/database.constants'

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
        TypeOrmModule.forRootAsync({
            name: HOOKS_SKYLINE_CONNECTION,
            imports: [ConfigModule],
            inject: [ConfigService, NacosService],
            useFactory: async (configService: ConfigService, nacosService: NacosService) => {
                await nacosService.loadConfig()
                return {
                    ...createMysqlOptions(configService, {
                        configKey: HOOKS_SKYLINE_MYSQL_CONFIG_KEY,
                        entities: [...HOOKS_SKYLINE_ENTITIES]
                    }),
                    name: HOOKS_SKYLINE_CONNECTION
                }
            }
        }),
        TypeOrmModule.forFeature([...HOOKS_MYSQL_ENTITIES]),
        TypeOrmModule.forFeature([...HOOKS_SKYLINE_ENTITIES], HOOKS_SKYLINE_CONNECTION)
    ],
    providers: [DataBaseService],
    exports: [TypeOrmModule, DataBaseService]
})
export class DatabaseModule {}
