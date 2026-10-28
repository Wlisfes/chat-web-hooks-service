import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'

/** SIMBANK 设备回执入参：POST /observe/simbank/webhook。开放接口，不校验签名。 */
export class SimbankWebhookDto {
    @ApiProperty({ description: '短信ID：SMS 提交时生成', example: 'c2f45ce1-30a5-4d14-b0d7-cb76b10f0e21' })
    @IsString({ message: '短信ID必须是字符串' })
    @IsNotEmpty({ message: '短信ID必填' })
    @MaxLength(36, { message: '短信ID长度不能超过36位' })
    msgId: string

    @ApiProperty({
        description: '发送结果：success=发送成功，failed=发送失败，delivered=已送达',
        enum: ['success', 'failed', 'delivered'],
        example: 'success'
    })
    @IsIn(['success', 'failed', 'delivered'], { message: 'sendStatus 必须是 success、failed 或 delivered' })
    sendStatus: 'success' | 'failed' | 'delivered'

    @ApiProperty({ description: '发送记录主键：tb_srm_simbank_message.key_id', example: 1001, required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '发送记录主键必须是整数' })
    @Min(1, { message: '发送记录主键必须大于0' })
    msgKeyId?: number

    @ApiProperty({ description: '发送设备主键', example: 100202, required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '设备主键必须是整数' })
    @Min(1, { message: '设备主键必须大于0' })
    simbankKeyId?: number

    @ApiProperty({ description: '发送端口主键', example: 1002485, required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '端口主键必须是整数' })
    @Min(1, { message: '端口主键必须大于0' })
    portKeyId?: number

    @ApiProperty({ description: '设备返回的状态码', example: 'OK', required: false })
    @IsOptional()
    @IsString({ message: '状态码必须是字符串' })
    @MaxLength(32, { message: '状态码长度不能超过32位' })
    statusCode?: string

    @ApiProperty({ description: '设备返回的状态说明', example: '发送成功', required: false })
    @IsOptional()
    @IsString({ message: '状态说明必须是字符串' })
    @MaxLength(512, { message: '状态说明长度不能超过512位' })
    statusMessage?: string

    @ApiProperty({ description: '设备发送完成时间，ISO-8601；不传时取接收时间', example: '2026-10-28T02:00:00.000Z', required: false })
    @IsOptional()
    @IsString({ message: '发送时间必须是字符串' })
    sendTime?: string
}

/** 回执受理响应：POST /observe/simbank/webhook。 */
export class SimbankWebhookResponseDto {
    @ApiProperty({ description: '短信ID', example: 'c2f45ce1-30a5-4d14-b0d7-cb76b10f0e21' })
    msgId: string

    @ApiProperty({ description: '是否为重复回执：去重窗口内已入队过，本次未重复入队', example: false })
    duplicate: boolean
}
