import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "vite";
const version = "20261123000000";
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
const applied = query([
  `select version from supabase_migrations.schema_migrations where version='${version}'`,
]);
if (applied.length) {
  console.log("VeilBoard migration is already applied.");
  process.exit(0);
}
const required = query([
  "select table_name from information_schema.tables where table_schema='public' and table_name in ('notes','note_links','campaign_settings','profiles','campaign_members')",
]);
if (required.length !== 5)
  throw new Error("目标数据库缺少旧版基础表，停止增量迁移。");
console.log(`Pending: ${version}_veilboard_surface.sql`);
if (dry) process.exit(0);
const sql = await readFile(
  new URL(
    `../supabase/migrations/${version}_veilboard_surface.sql`,
    import.meta.url,
  ),
  "utf8",
);
const directory = await mkdtemp(join(tmpdir(), "veilboard-migration-"));
const file = join(directory, `${version}.sql`);
await writeFile(
  file,
  `begin;
select pg_advisory_xact_lock(hashtextextended('veilboard-migrations',0));
do $guard$ begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then raise exception 'MIGRATION_ALREADY_APPLIED'; end if;
end $guard$;
${sql}
insert into supabase_migrations.schema_migrations(version,statements,name)
values('${version}',array['VeilBoard compatible surface migration'],'veilboard_surface');
commit;`,
  { mode: 0o600 },
);
query(["--file", file], false);
console.log("Applied VeilBoard migration.");
