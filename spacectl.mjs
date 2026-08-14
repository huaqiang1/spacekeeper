import https from "node:https";
import crypto from "node:crypto";

const SECRET_ID = process.env.TENCENT_SECRET_ID || "";
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || "";
const SPACE_KEY = process.env.SPACE_KEY || "fwwydr";
const REGION = process.env.TENCENT_REGION || "ap-guangzhou";

if (!SECRET_ID || !SECRET_KEY) {
  console.error("missing TENCENT_SECRET_ID / TENCENT_SECRET_KEY");
  process.exit(2);
}

function tc3Sign({ secretId, secretKey, service, host, action, version, payload }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload);
  const hashedPayload = crypto.createHash("sha256").update(body).digest("hex");
  const canHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonical = ["POST", "/", "", canHeaders, signedHeaders, hashedPayload].join("\n");
  const scope = `${date}/${service}/tc3_request`;
  const sts = ["TC3-HMAC-SHA256", timestamp, scope, crypto.createHash("sha256").update(canonical).digest("hex")].join("\n");
  const kDate = crypto.createHmac("sha256", `TC3${secretKey}`).update(date).digest();
  const kSvc = crypto.createHmac("sha256", kDate).update(service).digest();
  const kSign = crypto.createHmac("sha256", kSvc).update("tc3_request").digest();
  const signature = crypto.createHmac("sha256", kSign).update(sts).digest("hex");
  return {
    body,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Host: host,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Region": REGION,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Nonce": String(Math.floor(Math.random() * 1e9)),
      Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function apiCall(action, params = {}) {
  const service = "cloudstudio";
  const host = "cloudstudio.tencentcloudapi.com";
  const version = "2023-05-08";
  const { headers, body } = tc3Sign({ secretId: SECRET_ID, secretKey: SECRET_KEY, service, host, action, version, payload: params });
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, path: "/", method: "POST", headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const j = JSON.parse(data);
          if (j.Response?.Error) reject(new Error(`${j.Response.Error.Code}: ${j.Response.Error.Message}`));
          else resolve(j.Response || {});
        } catch {
          reject(new Error(`bad response: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function workspaceStatus() {
  const res = await apiCall("DescribeWorkspaces");
  const ws = (res.Data || []).find((s) => s.SpaceKey === SPACE_KEY);
  return ws ? ws.Status : "UNKNOWN";
}

async function waitReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = await workspaceStatus();
    console.log(`${new Date().toISOString()} status=${st}`);
    if (st === "RUNNING" || st === "READY") return st;
    await sleep(15000);
  }
  throw new Error(`workspace not ready within ${timeoutMs / 1000}s (last=${await workspaceStatus()})`);
}

async function main() {
  const cmd = process.argv[2];
  const arg = process.argv[3];

  if (cmd === "start") {
    console.log(`starting ${SPACE_KEY}...`);
    const st = await workspaceStatus();
    if (st === "RUNNING" || st === "READY") {
      console.log(`already ${st}`);
    } else {
      await apiCall("RunWorkspace", { SpaceKey: SPACE_KEY });
      console.log("RunWorkspace ok");
    }
    const final = await waitReady(10 * 60 * 1000);
    console.log(`ready: ${final}`);
  } else if (cmd === "hold") {
    const mins = parseInt(arg || "90", 10);
    console.log(`holding ${mins} minutes, then stopping...`);
    await sleep(mins * 60 * 1000);
    await apiCall("StopWorkspace", { SpaceKey: SPACE_KEY });
    console.log("stopped");
  } else if (cmd === "guard") {
    // Cloud Studio 空闲停机: 无人连接 IDE 时约 15 分钟自动停止.
    // guard: 在停机前轮询状态; 若任务窗口内被自动停机则尝试重启 (补偿至窗口结束).
    const mins = parseInt(arg || "12", 10);
    const deadline = Date.now() + mins * 60 * 1000;
    console.log(`guarding ${mins} minutes until ${new Date(deadline).toISOString()}...`);
    while (Date.now() < deadline) {
      const st = await workspaceStatus();
      if (st !== "RUNNING" && st !== "READY") {
        console.log(`${new Date().toISOString()} detected ${st}, restarting...`);
        await apiCall("RunWorkspace", { SpaceKey: SPACE_KEY });
        await waitReady(5 * 60 * 1000);
      }
      await sleep(60 * 1000);
    }
    console.log("guard window done");
  } else if (cmd === "guard-until") {
    // 守卫空间在线直到指定 UTC 时刻 (arg 形如 "05:25"); 期间若被空闲停机则自动重启补偿.
    const [hh, mm] = (arg || "").split(":").map(Number);
    if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      console.error('usage: guard-until "HH:MM" (UTC)');
      process.exit(2);
    }
    const now = new Date();
    let deadline = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0);
    if (deadline <= Date.now()) deadline += 24 * 3600 * 1000;
    console.log(`guarding until ${new Date(deadline).toISOString()}...`);
    while (Date.now() < deadline) {
      const st = await workspaceStatus();
      if (st !== "RUNNING" && st !== "READY") {
        console.log(`${new Date().toISOString()} detected ${st}, restarting...`);
        await apiCall("RunWorkspace", { SpaceKey: SPACE_KEY });
        await waitReady(5 * 60 * 1000);
      }
      await sleep(60 * 1000);
    }
    console.log("guard window done");
  } else if (cmd === "stop") {
    await apiCall("StopWorkspace", { SpaceKey: SPACE_KEY });
    console.log("stopped");
  } else if (cmd === "status") {
    console.log(`status=${await workspaceStatus()}`);
  } else {
    console.error("usage: node spacectl.mjs <start|guard <mins>|guard-until \"HH:MM\"|stop|status>");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});