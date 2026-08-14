# spacekeeper

CloudStudio 云端空间保活：GitHub Actions 每天定时唤醒/停止云端工作空间，保证空间内 crontab 定时任务（CloudStudio 三账号签到 + 2048 论坛签到）可靠执行。本地电脑关机亦不受影响。

## 调度（北京时间）

| workflow | 触发(UTC) | 北京时间 | 动作 | 空间内 cron |
|---|---|---|---|---|
| wake-farm | 21:00 | 05:00 | RunWorkspace → hold 100min → Stop | farm 签到 05:35 |
| wake-autosign | 23:50 | 07:50 | RunWorkspace → hold 110min → Stop | 2048 签到 08:30 |

## Secrets 配置（仓库 Settings → Secrets and variables → Actions）

- `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`：账号 a（fwwydr 空间所属腾讯云账号）的 API 密钥

## 本地使用

```bash
SPACE_KEY=fwwydr \
TENCENT_SECRET_ID=xxx TENCENT_SECRET_KEY=xxx \
node spacectl.mjs start    # 启动并等待 RUNNING
node spacectl.mjs hold 100 # 保持 100 分钟后停止
node spacectl.mjs stop
node spacectl.mjs status
```

## 云端 cron（cloud-runtime.sh 已同步）

- `35 5 * * *` farm/daily-farm.mjs
- `30 8 * * *` autosign/main.js