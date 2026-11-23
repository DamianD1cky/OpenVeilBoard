import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
test("增量迁移保持旧接口、隔离机密并检测并发冲突", async () => {
  const db = new PGlite();
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  async function user(n, fn) {
    await db.exec("begin");
    try {
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [uuid(n), JSON.stringify({ sub: uuid(n), is_anonymous: false })],
      );
      await db.exec("set local role authenticated");
      const result = await fn();
      await db.exec("commit");
      return result;
    } catch (cause) {
      await db.exec("rollback");
      throw cause;
    }
  }
  const first = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
      alter table storage.objects enable row level security;
      grant usage on schema auth,storage to authenticated;grant execute on all functions in schema auth to authenticated;`);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const filename of (await readdir(directory))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      try {
        await db.exec(await readFile(new URL(filename, directory), "utf8"));
      } catch (cause) {
        throw new Error(`${filename}: ${cause.message}`, { cause });
      }
    }
    await db.exec("update private.runtime set business_writes=true");
    for (const n of [1, 2, 3]) {
      await db.query("insert into auth.users(id,email) values($1,$2)", [
        uuid(n),
        `${n}@gm.local`,
      ]);
      await user(n, () => db.query("select public.ensure_actor()"));
    }
    const gm = (
      await first("select id from public.profiles where auth_user_id=$1", [
        uuid(1),
      ])
    ).id;
    const player = (
      await first("select id from public.profiles where auth_user_id=$1", [
        uuid(2),
      ])
    ).id;
    await user(1, () => db.query("select public.request_gm_access()"));
    await db.query(
      "update public.gm_access set status='approved' where user_id=$1",
      [gm],
    );
    const campaign = (
      await user(1, () =>
        first("select (public.create_campaign('测试桌','GM','主持人')).id id"),
      )
    ).id;
    await db.query(
      "insert into public.campaign_members(campaign_id,user_id,role,character_name,job_title) values($1,$2,'player','玩家','调查员')",
      [campaign, player],
    );
    const patch = {
      title: "真正的机密",
      body: "暗号是午夜",
      card_style: "dossier",
      surface_x: 0.2,
      surface_y: -0.1,
      capabilities: [
        {
          id: "seal",
          type: "secret",
          enabled: true,
          data: { scope: "gm", users: [] },
        },
        {
          id: "task",
          type: "checklist",
          enabled: true,
          data: { items: [{ id: "clue", text: "隐秘证据", done: false }] },
        },
      ],
    };
    const id = uuid(10);
    const save = (who, p, expected = null) =>
      user(who, () =>
        first("select public.save_veilboard_note($1,$2,$3,$4) data", [
          campaign,
          id,
          p,
          expected,
        ]),
      );
    const created = await save(1, patch);
    assert.equal(created.data.body, "暗号是午夜");
    const publicRow = await first(
      "select title,body,image_path,capabilities from public.notes where id=$1",
      [id],
    );
    assert.equal(publicRow.title, "机密便签");
    assert.equal(publicRow.body, "");
    assert.equal(JSON.stringify(publicRow).includes("隐秘证据"), false);
    const visible = (who) =>
      user(who, () =>
        first("select public.get_veilboard($1) data", [campaign]),
      );
    const playerBoard = (await visible(2)).data;
    assert.equal(JSON.stringify(playerBoard).includes("暗号是午夜"), false);
    assert.equal((await visible(1)).data.notes[0].body, "暗号是午夜");
    await assert.rejects(
      user(3, () => first("select public.get_veilboard($1)", [campaign])),
      /ROLE_REQUIRED/,
    );
    await assert.rejects(
      save(2, { title: "窃取" }, { title: "机密便签" }),
      /NOT_EDITABLE/,
    );
    await save(1, { body: "新暗号" }, { body: "暗号是午夜" });
    await assert.rejects(
      save(1, { body: "覆盖" }, { body: "暗号是午夜" }),
      /NOTE_CONFLICT/,
    );
    const selected = [
      {
        id: "seal",
        type: "secret",
        enabled: true,
        data: { scope: "selected", users: [player] },
      },
    ];
    await save(
      1,
      { capabilities: selected },
      { capabilities: patch.capabilities },
    );
    assert.equal((await visible(2)).data.notes[0].body, "新暗号");
    await save(1, { surface_x: -0.3 }, { surface_x: 0.2 });
    assert.equal(
      (await first("select x from public.notes where id=$1", [id])).x,
      Math.round(0.2 * 2056 + 44),
    );
    await db.query("update public.notes set x=1098 where id=$1", [id]);
    assert.ok(
      Math.abs(
        (await visible(1)).data.notes[0].surface_x - ((1098 - 44) / 2056 - 0.5),
      ) < 1e-10,
    );
    await save(
      1,
      { archived_at: new Date().toISOString() },
      { archived_at: null },
    );
    assert.ok((await visible(1)).data.notes[0].archived_at);
    const otherId = uuid(11);
    await user(1, () =>
      first("select public.save_veilboard_note($1,$2,$3,null)", [
        campaign,
        otherId,
        { title: "另一端" },
      ]),
    );
    await user(1, () =>
      first(
        "select public.save_veilboard_edge($1,$2,$3,$4,'关联','#b83227','rope')",
        [campaign, uuid(20), id, otherId],
      ),
    );
    await save(
      1,
      { archived_at: null },
      {
        archived_at: new Date(
          (await visible(1)).data.notes.find((n) => n.id === id).archived_at,
        ).toISOString(),
      },
    );
    assert.equal((await visible(1)).data.edges.length, 1);
    const comments = [
      {
        id: "comments",
        type: "comments",
        enabled: true,
        data: { entries: [] },
      },
    ];
    await user(1, () =>
      first("select public.save_veilboard_note($1,$2,$3,$4)", [
        campaign,
        otherId,
        { capabilities: comments },
        { capabilities: [] },
      ]),
    );
    const comment = (who, body, deletion = null) =>
      user(who, () =>
        first(
          "select public.comment_veilboard_note($1,$2,'comments',$3,$4) data",
          [campaign, otherId, body, deletion],
        ),
      );
    const added = (await comment(2, "玩家自己的批注")).data;
    const entry = added.capabilities[0].data.entries[0];
    assert.equal(entry.authorId, player);
    await assert.rejects(comment(1, "", entry.id), /COMMENT_NOT_EDITABLE/);
    await comment(2, "", entry.id);
    assert.equal(
      (await visible(1)).data.notes.find((n) => n.id === otherId)
        .capabilities[0].data.entries.length,
      0,
    );
    const image = `${campaign}/note-private-image.png`;
    assert.equal(
      (
        await user(2, () =>
          first("select private.veilboard_image_allowed($1,$2) allowed", [
            image,
            uuid(1),
          ]),
        )
      ).allowed,
      false,
    );
    assert.equal(
      (
        await user(1, () =>
          first("select private.veilboard_image_allowed($1,$2) allowed", [
            image,
            uuid(1),
          ]),
        )
      ).allowed,
      true,
    );
    await save(1, { color: "#8a3e35" }, { color: "yellow" });
    assert.equal(
      (await visible(1)).data.notes.find((n) => n.id === id).color,
      "#8a3e35",
    );
  } finally {
    await db.close();
  }
});
