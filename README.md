# chat-web-hooks-service

回执接收服务。接收 SIMBANK 设备和 Observe 的发送回执，去重后写入 RabbitMQ，再由本服务串行写回 SRM 发送状态，并带上供应商计费事件。对外接口是 `POST /simbank/webhook` 和 `POST /observe/simbank/webhook`，经网关前缀 `/api/observe` 访问。Hooks 连接 `chat-web-srm`，读写发送记录和计费发件箱，不建表。

| 项目          | 生产（Docker）                | 本地开发                                  |
| ------------- | ----------------------------- | ----------------------------------------- |
| HTTP 端口     | `5110`                        | `5112`                                    |
| Nacos Data ID | `chat-web-hooks-service.yaml` | `chat-web-hooks-service-development.yaml` |
| RabbitMQ      | 虚拟主机 `/chat-sms`          | 同左                                      |

Nacos 配置：

```yaml
server:
  port: 5110
simbank:
  secret: "与 Observe hooks.secret 相同"
gateway: ... # 从现有服务复制
rabbitmq: ... # 从 Dispatch 复制，vhost 为 /chat-sms
```

回执签名和回执结构定义在 `@wlisfes/chat-web-base-schema/observe`，回执队列拓扑定义在 `@wlisfes/chat-web-base-schema/rabbitmq`，Observe、Hooks、Dispatch 共用。

本地启动前复制 `.env.example` 为 `.env` 并填写 Nacos 连接信息，然后执行 `yarn dev`。生产部署详见 `deploy/RUNBOOK.md`。
