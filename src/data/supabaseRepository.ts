import { requireSupabase, rpc } from "../lib/supabase/client";
import type { BoardRepository, Note } from "../domain/types";
import type { DiceRoll } from "../features/dice/types";
import {
  normalizeCampaignClock,
  materializeCampaignClock,
} from "../features/campaign/domain/campaignClock";
import { validateDiceNotation } from "../features/dice/engine";
import { legacyToNormalized } from "../domain/geometry.js";
export function createSupabaseRepository(campaignId: string): BoardRepository {
  const client = requireSupabase();
  const urlCache = new Map<string, { url: string; until: number }>();
  async function imageUrl(path: string) {
    const cached = urlCache.get(path);
    if (cached && cached.until > Date.now()) return cached.url;
    const { data, error } = await client.storage
      .from("campaign-media")
      .createSignedUrl(path, 3600);
    if (error) throw error;
    urlCache.set(path, {
      url: data.signedUrl,
      until: Date.now() + 50 * 60_000,
    });
    return data.signedUrl;
  }
  async function mapNote(r: any): Promise<Note> {
    const point =
      r.surface_x == null || r.surface_y == null
        ? legacyToNormalized(r.x, r.y)
        : { x: r.surface_x, y: r.surface_y };
    return {
      id: r.id,
      campaignId,
      title: r.title,
      body: r.body,
      ...point,
      rotation: Number(r.rotation),
      layer: r.layer,
      color: r.color,
      pinColor: r.pin_color,
      cardStyle: r.card_style ?? "note",
      capabilities: r.capabilities ?? [],
      archivedAt: r.archived_at,
      authorId: r.author_id,
      authorName: r.author_name ?? "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      imagePath: r.image_path,
      imageUrl: r.image_path ? await imageUrl(r.image_path) : null,
      version: r.surface_version ?? 0,
    };
  }
  return {
    async load() {
      const data = await rpc<any>("get_veilboard", {
        p_campaign_id: campaignId,
      });
      return {
        notes: await Promise.all((data.notes ?? []).map(mapNote)),
        edges: (data.edges ?? []).map((e: any) => ({
          id: e.id,
          fromNoteId: e.from_note_id,
          toNoteId: e.to_note_id,
          label: e.label ?? "",
          color: e.color,
          style: e.style,
        })),
        clock: normalizeCampaignClock(data.clock),
        members: (data.members ?? []).map((m: any) => ({
          userId: m.user_id,
          name: m.character_name,
          role: m.role,
        })),
      };
    },
    async create(note) {
      return mapNote(
        await rpc("save_veilboard_note", {
          p_campaign_id: campaignId,
          p_id: note.id,
          p_patch: toPatch(note),
          p_expected: null,
        }),
      );
    },
    async save(note, patch, expected) {
      return mapNote(
        await rpc("save_veilboard_note", {
          p_campaign_id: campaignId,
          p_id: note.id,
          p_patch: toPatch(patch),
          p_expected: toPatch(expected),
        }),
      );
    },
    async remove(id) {
      await rpc("delete_veilboard_note", {
        p_campaign_id: campaignId,
        p_id: id,
      });
      urlCache.clear();
    },
    async saveEdge(edge) {
      const r = await rpc<any>("save_veilboard_edge", {
        p_campaign_id: campaignId,
        p_id: edge.id,
        p_from: edge.fromNoteId,
        p_to: edge.toNoteId,
        p_label: edge.label,
        p_color: edge.color,
        p_style: edge.style,
      });
      return { ...edge, id: r.id };
    },
    async removeEdge(id) {
      await rpc("delete_note_link", { p_campaign_id: campaignId, p_id: id });
    },
    async saveClock(clock) {
      return normalizeCampaignClock(
        await rpc("update_campaign_clock", {
          p_campaign_id: campaignId,
          p_config: materializeCampaignClock(clock),
        }),
      );
    },
    async roll(notation, label) {
      const body = {
        campaignId,
        requestId: crypto.randomUUID(),
        notation: validateDiceNotation(notation),
        label,
        visibility: "public",
      };
      if (
        import.meta.env.DEV ||
        ["localhost", "127.0.0.1"].includes(location.hostname)
      ) {
        const { data: auth, error: authError } = await client.auth.getSession();
        if (authError || !auth.session) throw new Error("请先登录。");
        const response = await fetch("/api/veilboard/dice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok || data?.error)
          throw new Error(data?.error ?? "投骰失败。");
        return data as DiceRoll;
      }
      const { data, error } = await client.functions.invoke("roll-dice", {
        body,
      });
      if (error || data?.error)
        throw new Error(data?.error ?? error?.message ?? "投骰失败。");
      return data as DiceRoll;
    },
    subscribe(onChange, onRoll) {
      const channel = client.channel(
        `veilboard:${campaignId}:${crypto.randomUUID()}`,
      );
      for (const table of [
        "notes",
        "note_links",
        "campaign_settings",
        "campaign_members",
      ]) {
        for (const event of ["INSERT", "UPDATE"] as const)
          channel.on(
            "postgres_changes",
            {
              event,
              schema: "public",
              table,
              filter: `campaign_id=eq.${campaignId}`,
            },
            onChange,
          );
        // Supabase cannot filter DELETE events by a non-primary-key column.
        channel.on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table },
          onChange,
        );
      }
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dice_rolls",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          // Read the authoritative result through its existing permission RPC.
          const id = (payload.new as any)?.id;
          if (id)
            void rpc<DiceRoll>("get_dice_roll", { p_id: id })
              .then((r) => {
                if (r.status === "complete" && r.result) onRoll(r);
              })
              .catch(() => {});
        },
      );
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") onChange();
      });
      return () => {
        void client.removeChannel(channel);
        urlCache.clear();
      };
    },
    imageUrl,
    async comment(noteId, capabilityId, body, deleteId) {
      return mapNote(
        await rpc("comment_veilboard_note", {
          p_campaign_id: campaignId,
          p_id: noteId,
          p_capability_id: capabilityId,
          p_body: body,
          p_delete_id: deleteId ?? null,
        }),
      );
    },
    async upload(file) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 4 * 1024 * 1024
      )
        throw new Error("请选择 4 MB 以内的 JPG、PNG 或 WebP 图片。");
      const extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      }[file.type];
      const path = `${campaignId}/note-${crypto.randomUUID()}.${extension}`;
      const { error } = await client.storage
        .from("campaign-media")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      return path;
    },
  };
}
function toPatch(patch: Record<string, any>) {
  const names: Record<string, string> = {
    x: "surface_x",
    y: "surface_y",
    cardStyle: "card_style",
    pinColor: "pin_color",
    imagePath: "image_path",
    archivedAt: "archived_at",
  };
  const allowed = new Set([
    "title",
    "body",
    "surface_x",
    "surface_y",
    "rotation",
    "card_style",
    "pin_color",
    "image_path",
    "archived_at",
    "color",
    "capabilities",
  ]);
  return Object.fromEntries(
    Object.entries(patch)
      .map(([key, value]) => [names[key] ?? key, value])
      .filter(([key]) => allowed.has(key as string)),
  );
}
