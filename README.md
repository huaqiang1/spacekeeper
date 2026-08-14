# spacekeeper

CloudStudio 云端空间保活：GitHub Actions 每天定时唤醒/停止云端工作空间，保证空间内 crontab 定时任务（CloudStudio 三账号签到 + 2048 论坛签到）可靠执行。本地电脑关机亦不受影响。

## 时区说明（重要）

云端容器时区为 **UTC**，空间内 crontab 以 UTC 执行：
- farm 签到：`5 5 * * *`（UTC）= 北京时间 **13:05**
- 2048 签到：`0 8 * * *`（UTC）= 北京时间 **16:00**

## 调度（均为 UTC，GitHub Actions 亦为 UTC）

| workflow | 触发(UTC) | 动作 | 覆盖任务 |
|---|---|---|---|
| wake-farm | 03:50 | RunWorkspace → hold 110min → Stop | farm 签到 05:05 UTC |
| wake-autosign | 07:00 | RunWorkspace → hold 110min → Stop | 2048 签到 08:00 UTC |

空间每天运行约 3.5 小时（两段），其余时间停机省机时。

## Secrets（仓库 Settings → Secrets and variables → Actions）

- `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`：账号 a（fwwydr 空间所属腾讯云账号 100048368453）的 API 密钥
- 密钥仅 Actions 运行时注入，不进仓库

## 本地使用

```bash
SPACE_KEY=fwwydr \
TENCENT_SECRET_ID=xxx TENCENT_SECRET_KEY=xxx \
node spacectl.mjs start    # 启动并等待 RUNNING
node spacectl.mjs hold 100 # 保持 100 分钟后停止
node spacectl.mjs stop
node spacectl.mjs status
```

## 说明

- Cloud Studio 免费空间空闲自动停机，crontab 随之中断；本保活确保任务窗口内空间在线。
- farm 签到另有平台自动发放兜底（每日北京时间 05:05 平台发放奖励），保活缺失时 farm 奖励不受影响；2048 签到则依赖空间在线。