# Hooks 部署变更记录

## 2026-10-28：回执接口改为 /observe/simbank/webhook

- 变更内容：回执模块改名为 simbank，接口路径从 `POST /observe/receipt` 改为 `POST /observe/simbank/webhook`，旧路径移除。
- 机器侧操作：部署 Hooks 前后把 Observe Nacos `hooks.url` 改为 `http://chat-web-hooks-service:5110/observe/simbank/webhook`，修改后立即生效。切换间隙推送失败的回执由 Observe 退避重试，重试用完由 Dispatch 回执超时检查补偿。
- 回滚方法：回退 Hooks 镜像，并把 Nacos `hooks.url` 改回 `/observe/receipt`。

## 2026-10-28：新增回执接收服务

- 影响机器：`chat-home-server`。
- 变更内容：新增 `chat-web-hooks-service` 容器，HTTP `5110`。接收 Observe 发送回执，校验签名、去重后发布到 RabbitMQ `/chat-sms` 的 `chat.sms.receipt.observe` 队列，由 Dispatch 写回发送记录。
- 机器侧操作：创建 Nacos `chat-web-hooks-service.yaml`（`server.port`、`observe.secret`、`gateway`、`rabbitmq`）；Observe Nacos 增加 `hooks` 节点。
- 验证命令：`yarn test`；部署后容器 `/health` 返回 200，Observe 发送后日志出现 `回执已转发`。
- 回滚方法：停止 Hooks 容器；Observe 推送失败只记录告警，Dispatch 回执超时检查按短信ID查询补偿。
