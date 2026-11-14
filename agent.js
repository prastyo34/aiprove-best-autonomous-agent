// best-autonomous-agent — AIProve entry (agent: ndesomen)
// A fully autonomous agent: no human in the loop. It reads aiprove.fun/skill.md,
// signs in with its own keypair, lists open bounties, enters every bounty it
// can, and completes the forecast bounties it can price with a simple rule.
// Gated bounties (need 100,000 $PROVE, not yet launched) are skipped, as are
// bounties needing data it cannot fetch (fresh pons launches) or a human X post.
// API base override: API_BASE_URL (default https://aiprove.fun).
const https = require("https");
const { Wallet } = require("ethers");

const API = (process.env.API_BASE_URL || "https://aiprove.fun").replace(/\/$/, "");

function req(method, path, body, token, base) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL((base || API) + path);
    const lib = u.protocol === "http:" ? require("http") : https;
    const r = lib.request(
      { method, hostname: u.hostname, path: u.pathname + u.search,
        headers: { "content-type": "application/json", "user-agent": "aiprove-autonomous-agent/1.0",
          ...(data ? { "content-length": Buffer.byteLength(data) } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}) } },
      (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve(b); } }); }
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "http:" ? require("http") : https;
    lib.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { "user-agent": "Mozilla/5.0" } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c));
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

// Simple trend rule for BTC 7-day direction: 7d return of daily closes.
async function btcDirection() {
  const candles = await fetchJson("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400");
  const closes = candles.slice(0, 8).map((c) => c[4]);
  const ret7 = closes[0] / closes[7] - 1;
  return { answer: ret7 >= 0 ? "yes" : "no", confidence: 0.6, ret7: +ret7.toFixed(4), lastClose: closes[0] };
}

// NVDA 3-day close: persistence rule — predict the latest close.
async function nvdaClose() {
  const d = await fetchJson("https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=5d&interval=1d");
  const meta = d.chart.result[0].meta;
  return { value: Math.round(meta.regularMarketPrice * 100) / 100, last: meta.regularMarketPrice };
}

(async () => {
  const report = { entered: [], submitted: [], skipped: [] };

  const skill = await req("GET", "/skill.md");
  if (!String(skill).includes("Authenticate")) throw new Error("skill.md unreadable");
  console.log("[1] skill.md read");

  const wallet = Wallet.createRandom();
  const handle = "auto-" + wallet.address.slice(2, 8);
  console.log("[2] agent address:", wallet.address);

  const ch = await req("GET", `/api/auth/challenge?address=${wallet.address}`);
  const sig = await wallet.signMessage(ch.challenge);
  const sess = await req("POST", "/api/auth/verify", { address: wallet.address, signature: sig });
  if (!sess.token) throw new Error("verify failed: " + JSON.stringify(sess));
  console.log("[3] authenticated");

  const list = await req("GET", "/api/bounties?status=open");
  const open = list.bounties || [];
  console.log("[4] open bounties:", open.length);

  for (const b of open) {
    if (b.gated) { report.skipped.push({ slug: b.slug, why: "gated: needs 100,000 $PROVE (not launched)" }); continue; }
    const e = await req("POST", `/api/bounties/${b.slug}/enter`, { handle }, sess.token);
    if (e.error) { report.skipped.push({ slug: b.slug, why: e.error }); continue; }
    report.entered.push(b.slug);

    try {
      if (b.slug === "forecast-btc-7d") {
        const p = await btcDirection();
        const s = await req("POST", `/api/bounties/${b.slug}/submit`, { prediction: { answer: p.answer, confidence: p.confidence }, handle }, sess.token);
        report.submitted.push({ slug: b.slug, id: s.id, prediction: p });
      } else if (b.slug === "forecast-nvda-3d") {
        const p = await nvdaClose();
        const s = await req("POST", `/api/bounties/${b.slug}/submit`, { prediction: { answer: p.value, value: p.value }, handle }, sess.token);
        report.submitted.push({ slug: b.slug, id: s.id, prediction: p });
      }
    } catch (err) {
      report.skipped.push({ slug: b.slug, why: "submit failed: " + err.message });
    }
  }

  console.log(JSON.stringify({ ok: true, address: wallet.address, ...report }, null, 2));
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
