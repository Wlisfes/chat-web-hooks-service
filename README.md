# chat-web-hooks-service

回执接收服务。Observe 发送完成后通过 HTTP 推送回执，Hooks 校验签名、去重后转发到 RabbitMQ 回执队列，由 Dispatch 写回发送记录。Hooks 不连接数据库。

| 项目          | 生产（Docker）                | 本地开发                                  |
| ------------- | ----------------------------- | ----------------------------------------- |
| HTTP 端口     | `5110`                        | `5112`                                    |
| Nacos Data ID | `chat-web-hooks-service.yaml` | `chat-web-hooks-service-development.yaml` |
| RabbitMQ      | 虚拟主机 `/chat-sms`          | 同左                                      |

Nacos 配置：

```yaml
server:
  port: 5110
observe:
  secret: "与 Observe hooks.secret 相同"
gateway: ... # 从现有服务复制
rabbitmq: ... # 从 Dispatch 复制，vhost 为 /chat-sms
```

回执签名和回执结构定义在 `@wlisfes/chat-web-base-schema/observe`，回执队列拓扑定义在 `@wlisfes/chat-web-base-schema/rabbitmq`，Observe、Hooks、Dispatch 共用。

本地启动前复制 `.env.example` 为 `.env` 并填写 Nacos 连接信息，然后执行 `yarn dev`。生产部署详见 `deploy/RUNBOOK.md`。
