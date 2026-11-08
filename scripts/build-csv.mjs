import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RATES_DIR = join(ROOT, "data/rates");
const OUT_DIR = join(ROOT, "data");

const KYIV_DATE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Kyiv",
});

const leg = (rates, currency, quote) =>
  rates.find((x) => x.currency === currency && x.quoteCurrency === quote) ?? null;

// Latest parsed post per Kyiv day.
const byDate = {};
for (const f of readdirSync(RATES_DIR)) {
  if (!f.endsWith(".json")) continue;
  const m = JSON.parse(readFileSync(join(RATES_DIR, f), "utf8"));
  if (m.status !== "parsed") continue;

  const usdUah = leg(m.rates, "USD", "UAH");
  const usdtUsd = leg(m.rates, "USDT", "USD");
  if (!usdUah || !usdtUsd) continue;

  const date = KYIV_DATE.format(new Date(m.postedAt));
  if (byDate[date] && byDate[date].postedAt >= m.postedAt) continue;

  byDate[date] = { postedAt: m.postedAt, usdUah, usdtUsd };
}

const dates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));
const round = (x) => Math.round(x * 1e4) / 1e4;

// buy-usd (sell side, what you pay to buy USD):
//   uah  = UAH per USD  -> USD = uahAmount / uah
//   usdt = USD per USDT -> USD = usdtAmount * usdt
// buy-uah (buy side, what you get selling for UAH):
//   usd  = UAH per USD  -> UAH = usdAmount * usd
//   usdt = UAH per USDT via USD -> UAH = usdtAmount * usdt
const tables = {
  "buy-usd.csv": ["date,uah,usdt", ({ usdUah, usdtUsd }) => [usdUah.sell, usdtUsd.sell]],
  "buy-uah.csv": ["date,usd,usdt", ({ usdUah, usdtUsd }) => [usdUah.buy, round(usdtUsd.buy * usdUah.buy)]],
};

for (const [name, [header, cols]] of Object.entries(tables)) {
  const rows = dates.map((d) => [d, ...cols(byDate[d])].join(","));
  writeFileSync(join(OUT_DIR, name), header + "\n" + rows.join("\n") + "\n");
  console.log(`${rows.length} days -> ${name}`);
}
