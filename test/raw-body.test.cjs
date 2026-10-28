const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { NestFactory } = require('@nestjs/core')
const { Controller, Post, Req, Module } = require('@nestjs/common')

// 回归：setupSwagger 会再注册一次 express.json()；main.ts 必须先注册保留原文的解析器，否则验签拿不到请求原文。
test('先注册保留原文的 JSON 解析器后，后续 express.json() 不会丢失 rawBody', async () => {
    class EchoController {
        echo(request) {
            return { raw: request.rawBody?.toString('utf8') ?? null }
        }
    }
    Req()(EchoController.prototype, 'echo', 0)
    Post('echo')(EchoController.prototype, 'echo', Object.getOwnPropertyDescriptor(EchoController.prototype, 'echo'))
    Controller()(EchoController)
    class EchoModule {}
    Module({ controllers: [EchoController] })(EchoModule)
    const app = await NestFactory.create(EchoModule, { logger: false })
    app.use(express.json({ verify: (request, _response, buffer) => (request.rawBody = Buffer.from(buffer)) }))
    app.use(express.json())
    await app.listen(0, '127.0.0.1')
    try {
        const { port } = app.getHttpServer().address()
        const body = '{"msgId":"m1",  "a":1}'
        const response = await fetch(`http://127.0.0.1:${port}/echo`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body
        })
        assert.deepEqual(await response.json(), { raw: body })
    } finally {
        await app.close()
    }
})
