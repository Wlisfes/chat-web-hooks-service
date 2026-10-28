import { ApiProperty } from '@nestjs/swagger'

/** 回执受理响应：POST /observe/receipt。 */
export class ReceiptAcceptResponseDto {
    @ApiProperty({ description: '短信ID', example: 'c2f45ce1-30a5-4d14-b0d7-cb76b10f0e21' })
    msgId: string

    @ApiProperty({ description: '是否为重复回执：去重窗口内已转发过，本次未重复转发', example: false })
    duplicate: boolean
}
