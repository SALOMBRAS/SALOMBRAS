// Gera o card de estatísticas (estrelas, commits, PRs, issues, repositórios)
// a partir do GraphQL do GitHub, no mesmo visual do card de sequência.
// Uso: GITHUB_TOKEN=... node scripts/stats-card.mjs <usuario> <saida.svg>
// Substitui o 3-stats.svg do github-profile-summary-cards, que com o token do
// Actions só contava commits de repositório público.

const [user, out] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!user || !out || !token) {
  console.error("uso: GITHUB_TOKEN=... node stats-card.mjs <usuario> <saida.svg>");
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
  `query($login:String!){ user(login:$login){
    pullRequests(first:1){ totalCount }
    issues(first:1){ totalCount }
    repositoriesContributedTo(first:1, includeUserRepositories:true,
      contributionTypes:[COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]){ totalCount }
    repositories(first:100, ownerAffiliations:OWNER){ nodes{ stargazerCount } }
    contributionsCollection{ contributionYears } } }`,
  { login: user },
);

// Commits de todos os anos. Contribuição em repositório privado aparece como
// "restricted" quando o token não enxerga o repositório; somar as duas evita
// contar só os públicos.
let commits = 0;
for (const y of u.contributionsCollection.contributionYears) {
  const d = await gql(
    `query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){ contributionsCollection(from:$from,to:$to){
        totalCommitContributions restrictedContributionsCount
        contributionCalendar{ totalContributions } } } }`,
    { login: user, from: `${y}-01-01T00:00:00Z`, to: `${y}-12-31T23:59:59Z` },
  );
  const c = d.user.contributionsCollection;
  console.log(`${y}: commits=${c.totalCommitContributions} restritas=${c.restrictedContributionsCount} calendario=${c.contributionCalendar.totalContributions}`);
  commits += c.totalCommitContributions + c.restrictedContributionsCount;
}

const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
const rows = [
  ["Total Stars", stars],
  ["Total Commits", commits],
  ["Total PRs", u.pullRequests.totalCount],
  ["Total Issues", u.issues.totalCount],
  ["Contributed to", u.repositoriesContributedTo.totalCount],
];

const bg = "#0f172a", amber = "#f59e0b", text = "#e5e7eb";
const font = `font-family="Segoe UI,Ubuntu,sans-serif"`;
const fmtN = (n) => n.toLocaleString("en-US");
const lines = rows
  .map(([k, v], i) => {
    const y = 66 + i * 25;
    return `<circle cx="32" cy="${y - 5}" r="4" fill="${amber}"/>
  <text x="46" y="${y}" fill="${text}" font-size="14" font-weight="600" ${font}>${k}:</text>
  <text x="230" y="${y}" fill="${text}" font-size="14" font-weight="700" ${font}>${fmtN(v)}</text>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195" viewBox="0 0 495 195" role="img" aria-label="Estatísticas do GitHub de ${user}">
  <title>${rows.map(([k, v]) => `${k}: ${fmtN(v)}`).join(", ")}</title>
  <rect width="495" height="195" rx="4.5" fill="${bg}"/>
  <text x="25" y="35" fill="${amber}" font-size="18" font-weight="600" ${font}>GitHub Stats</text>
  ${lines}
</svg>
`;
const fs = await import("node:fs");
fs.mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
fs.writeFileSync(out, svg);
console.log(rows.map(([k, v]) => `${k}=${v}`).join(" ") + ` → ${out}`);
