import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "vite";

const migrations = [
  {
    version: "20261123000000",
    name: "veilboard_surface",
    file: "20261123000000_veilboard_surface.sql",
    note: "VeilBoard compatible surface migration",
  },
  {
    version: "20261124000000",
    name: "veilboard_upgrades",
    file: "20261124000000_veilboard_upgrades.sql",
    note: "VeilBoard multi-image media and burnt note material upgrade",
  },
];

const env = loadEnv("development", process.cwd(), "VITE_");
const project = env.VITE_SUPABASE_URL
  ? new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0]
  : "";
if (!/^[a-z]{20}$/.test(project))
  throw new Error("请先配置目标 Supabase URL。");
const dry = process.argv.includes("--dry-run");

function query(args, readonly = true) {
  const result = spawnSync(
    "node_modules/.bin/supabase",
    [
      "db",
      "query",
      `--remote=${project}`,
      ...(readonly ? ["--read-only"] : ["--yes"]),
      "--output",
      "json",
      ...args,
    ],
    { encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024 * 8 },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || "Supabase 查询失败。");
  // CLI writes a human target prefix before the JSON payload.
  const output = result.stdout,
    start = output.indexOf("[");
  return start < 0 ? [] : JSON.parse(output.slice(start));
}

console.log(`Target project: ${project}`);
const versionList = migrations.map((m) => `'${m.version}'`).join(",");
const appliedRows = query([
  `select version from supabase_migrations.schema_migrations where version in (${versionList})`,
]);
const appliedSet = new Set(appliedRows.map((r) => String(r.version)));
const pending = migrations.filter((m) => !appliedSet.has(m.version));

if (!pending.length) {
  console.log("All VeilBoard migrations are already applied.");
  process.exit(0);
}

const required = query([
  "select table_name from information_schema.tables where table_schema='public' and table_name in ('notes','note_links','campaign_settings','profiles','campaign_members')",
]);
if (required.length !== 5)
  throw new Error("目标数据库缺少旧版基础表，停止增量迁移。");

for (const m of pending) console.log(`Pending: ${m.file}`);
if (dry) process.exit(0);

const directory = await mkdtemp(join(tmpdir(), "veilboard-migration-"));
for (const m of pending) {
  const sql = await readFile(
    new URL(`../supabase/migrations/${m.file}`, import.meta.url),
    "utf8",
  );
  const file = join(directory, `${m.version}.sql`);
  await writeFile(
    file,
    `begin;
select pg_advisory_xact_lock(hashtextextended('veilboard-migrations',0));
do $guard$ begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='${m.version}') then raise exception 'MIGRATION_ALREADY_APPLIED'; end if;
end $guard$;
${sql}
insert into supabase_migrations.schema_migrations(version,statements,name)
values('${m.version}',array['${m.note}'],'${m.name}');
commit;`,
    { mode: 0o600 },
  );
  query(["--file", file], false);
  console.log(`Applied: ${m.file}`);
}
