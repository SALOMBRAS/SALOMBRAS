// Gera o card de sequência de contribuições a partir do GraphQL do GitHub.
// Uso: GITHUB_TOKEN=... node scripts/streak-card.mjs <usuario> <saida.svg>
// Substitui o streak-stats.demolab.com, que guarda cache por 24 h.

const [user, out] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!user || !out || !token) {
  console.error("uso: GITHUB_TOKEN=... node streak-card.mjs <usuario> <saida.svg>");
  process.exit(1);
}

async function gql(query, variables) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const { user: u } = await gql(
  `query($login:String!){ user(login:$login){ createdAt contributionsCollection{ contributionYears } } }`,
  { login: user },
);
const years = u.contributionsCollection.contributionYears.sort();

const days = [];
for (const y of years) {
  const d = await gql(
    `query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){ contributionsCollection(from:$from,to:$to){
        contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`,
    { login: user, from: `${y}-01-01T00:00:00Z`, to: `${y}-12-31T23:59:59Z` },
  );
  for (const w of d.user.contributionsCollection.contributionCalendar.weeks)
    for (const x of w.contributionDays) days.push(x);
}
days.sort((a, b) => a.date.localeCompare(b.date));

// Fortaleza (UTC-3): o dia de hoje pode ainda não ter contribuição; não quebra a sequência.
const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const active = days.filter((d) => d.contributionCount > 0);
const total = active.reduce((s, d) => s + d.contributionCount, 0);
const first = active[0]?.date ?? today;

let cur = 0, curStart = null, best = 0, bestStart = null, bestEnd = null, run = 0, runStart = null;
for (const d of days) {
  if (d.date > today) break;
  if (d.contributionCount > 0) {
    if (run === 0) runStart = d.date;
    run++;
    if (run > best) { best = run; bestStart = runStart; bestEnd = d.date; }
  } else if (d.date !== today) {
    run = 0;
  }
}
// sequência atual = última corrida que chega até hoje ou ontem
{
  let i = days.findIndex((d) => d.date === today);
  if (i < 0) i = days.length - 1;
  if (days[i].contributionCount === 0) i--;
  let end = i;
  while (i >= 0 && days[i].contributionCount > 0) i--;
  cur = end - i;
  curStart = cur > 0 ? days[i + 1].date : null;
}

const MESES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (iso, withYear = false) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${MESES[+m - 1]} ${+d}${withYear ? `, ${y}` : ""}`;
};
const lastActive = active.length ? active[active.length - 1].date : today;

const bg = "#0f172a", amber = "#f59e0b", text = "#e5e7eb", dates = "#94a3b8";
const num = (x, y, v) => `<text x="${x}" y="${y}" text-anchor="middle" fill="${text}" font-size="28" font-weight="700" font-family="Segoe UI,Ubuntu,sans-serif">${v}</text>`;
const lbl = (x, y, v, c = text) => `<text x="${x}" y="${y}" text-anchor="middle" fill="${c}" font-size="14" font-weight="${c === amber ? 700 : 400}" font-family="Segoe UI,Ubuntu,sans-serif">${v}</text>`;
const sub = (x, y, v) => `<text x="${x}" y="${y}" text-anchor="middle" fill="${dates}" font-size="12" font-family="Segoe UI,Ubuntu,sans-serif">${v}</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195" viewBox="0 0 495 195" role="img" aria-label="Sequência de contribuições de ${user}">
  <title>Sequência de contribuições: ${cur} dias atuais, ${best} no máximo, ${total.toLocaleString("en-US")} no total</title>
  <rect width="495" height="195" rx="4.5" fill="${bg}"/>
  <line x1="165" y1="28" x2="165" y2="170" stroke="${amber}" stroke-opacity=".35"/>
  <line x1="330" y1="28" x2="330" y2="170" stroke="${amber}" stroke-opacity=".35"/>

  ${num(82, 80, total.toLocaleString("en-US"))}
  ${lbl(82, 112, "Total Contributions")}
  ${sub(82, 138, `${fmt(first, true)} - Present`)}

  <circle cx="247" cy="71" r="40" fill="none" stroke="${amber}" stroke-width="5"/>
  <circle cx="247" cy="29" r="10" fill="${bg}"/>
  <text x="247" y="36" text-anchor="middle" font-size="18">🔥</text>
  ${num(247, 81, cur)}
  ${lbl(247, 136, "Current Streak", amber)}
  ${sub(247, 158, cur > 0 ? `${fmt(curStart)} - ${fmt(lastActive)}` : "")}

  ${num(412, 80, best)}
  ${lbl(412, 112, "Longest Streak")}
  ${sub(412, 138, best > 0 ? `${fmt(bestStart)} - ${fmt(bestEnd)}` : "")}
</svg>
`;
const fs = await import("node:fs");
fs.mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
fs.writeFileSync(out, svg);
console.log(`total=${total} atual=${cur} (${curStart}→${lastActive}) maior=${best} (${bestStart}→${bestEnd}) → ${out}`);
