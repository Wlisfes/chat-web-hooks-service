# Hooks 服务运行手册

## 运行基线

| 项目                   | 基线                                                     |
| ---------------------- | -------------------------------------------------------- |
| 容器                   | `chat-web-hooks-service`                                 |
| HTTP 端口              | `5110`（主机只绑定 `127.0.0.1`；Observe 经 Docker 网络访问） |
| Nacos Data ID / 服务名 | `chat-web-hooks-service.yaml` / `chat-web-hooks-service` |
| RabbitMQ               | 虚拟主机 `/chat-sms`，发布到 `chat.sms.simbank.webhook.exchange`   |
| 数据库                 | 不连接                                                   |
| 部署目录               | `/opt/chat-web-hooks-service`                            |

## 职责

Observe 发送完成后 `POST /observe/simbank/webhook` 推送回执，Hooks 校验 HMAC 签名（`x-simbank-webhook-timestamp`、`x-simbank-webhook-signature`）和字段，按 `msgId:sendStatus` 去重后发布到 `chat.sms.simbank.webhook` 队列，由 Dispatch 写回发送记录。Hooks 不写库；发布失败返回 503，Observe 按退避间隔重试。

## 首次部署前准备

1. 在 GitHub 创建仓库 `Wlisfes/chat-web-hooks-service`，注册带 `chat-home-server` 标签的自托管 Runner，创建 `production-home` 环境。
2. 部署主机已存在外部网络 `chat-web-infrastructure`，以及 Finance 或 Gateway 的 `.env` 可供继承 Nacos 连接参数。
3. 首次部署前在 Nacos 手工创建 `chat-web-hooks-service.yaml`，或由 `bootstrap-nacos-config.cjs` 从 `chat-web-dispatch-service.yaml` 复制 `gateway`、`rabbitmq` 自动生成（`simbank.secret` 取环境变量 `HOOKS_SIMBANK_SECRET`，未提供时随机生成）。
4. Observe Nacos 增加 `hooks.url: http://chat-web-hooks-service:5110/observe/simbank/webhook`、`hooks.secret`（与 Hooks `simbank.secret` 相同）。

## 验证

```sh
docker exec chat-web-hooks-service node -e "require('http').get('http://127.0.0.1:5110/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"
docker logs --tail 50 chat-web-hooks-service | grep '回执已转发'
```
