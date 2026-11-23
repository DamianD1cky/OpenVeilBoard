const sources = (name) => [`/audio/${name}.webm`, `/audio/${name}.mp3`];
const AMBIENT_LOOP = [1e3, 6e4];
export const GALLERY_HOVER_NOTES = [`fs5`, `a5`, `b5`, `d6`, `e6`, `fs6`];
export const AUDIO_TRACKS = {
  "ambient.home": {
    src: sources(`ambient-home`),
    kind: `ambient`,
    loopRegion: AMBIENT_LOOP,
    volume: 0.12,
  },
  "ambient.work": {
    src: sources(`ambient-work`),
    kind: `ambient`,
    loopRegion: AMBIENT_LOOP,
    volume: 0.12,
  },
  "ambient.lab": {
    src: sources(`ambient-lab`),
    kind: `ambient`,
    loopRegion: AMBIENT_LOOP,
    volume: 0.12,
  },
  "intro.print": {
    src: sources(`intro-print`),
    variants: 2,
    slot: 3.4,
    volume: 0.5,
    cooldown: 1e3,
  },
  "ui.hover": {
    src: sources(`ui-hover`),
    variants: 4,
    slot: 0.3,
    volume: 0.26,
    cooldown: 70,
    rate: [0.985, 1.015],
  },
  "ui.select": {
    src: sources(`ui-select`),
    variants: 4,
    slot: 0.45,
    volume: 0.5,
    cooldown: 50,
    rate: [0.985, 1.015],
  },
  "ui.close": {
    src: sources(`ui-close`),
    variants: 3,
    slot: 0.55,
    volume: 0.5,
    cooldown: 80,
  },
  "scene.transition": {
    src: sources(`scene-transition`),
    variants: 2,
    slot: 3,
    volume: 0.42,
    cooldown: 240,
  },
  "scene.breeze": {
    src: sources(`scene-breeze`),
    variants: {
      right: 2,
      left: 2,
    },
    slot: 3.4,
    volume: 0.36,
    cooldown: 1500,
  },
  "polaroid.hover": {
    src: sources(`polaroid-hover`),
    variants: Object.fromEntries(GALLERY_HOVER_NOTES.map((note) => [note, 2])),
    slot: 0.6,
    volume: 0.24,
    cooldown: 60,
  },
  "polaroid.pickup": {
    src: sources(`polaroid-pickup`),
    variants: 4,
    slot: 0.5,
    volume: 0.5,
    cooldown: 80,
    rate: [0.97, 1.03],
  },
  "polaroid.drop": {
    src: sources(`polaroid-drop`),
    variants: 4,
    slot: 0.75,
    volume: 0.48,
    cooldown: 90,
    rate: [0.97, 1.03],
  },
  "polaroid.dock": {
    src: sources(`polaroid-dock`),
    variants: 3,
    slot: 0.5,
    volume: 0.5,
    cooldown: 110,
    rate: [0.98, 1.02],
  },
  "polaroid.open": {
    src: sources(`polaroid-open`),
    variants: 2,
    slot: 1.4,
    volume: 0.5,
    cooldown: 180,
  },
  "polaroid.scan": {
    src: sources(`polaroid-scan`),
    variants: 2,
    slot: 2.2,
    volume: 0.22,
    cooldown: 400,
  },
  "polaroid.shuffle": {
    src: sources(`polaroid-shuffle`),
    variants: 3,
    slot: 1.5,
    volume: 0.38,
    cooldown: 300,
    rate: [0.97, 1.03],
  },
  "camera.ready": {
    src: sources(`camera-ready`),
    variants: 2,
    slot: 0.3,
    volume: 0.3,
    cooldown: 120,
  },
  "camera.shutter": {
    src: sources(`camera-shutter`),
    variants: 3,
    slot: 1.2,
    volume: 0.5,
    cooldown: 300,
  },
  "camera.eject": {
    src: sources(`camera-eject`),
    variants: 2,
    slot: 1.4,
    volume: 0.44,
    cooldown: 300,
  },
  "media.open": {
    src: sources(`media-open`),
    variants: 2,
    slot: 1.1,
    volume: 0.46,
    cooldown: 180,
  },
  "media.close": {
    src: sources(`media-close`),
    variants: 2,
    slot: 0.9,
    volume: 0.44,
    cooldown: 180,
  },
  "lab.open": {
    src: sources(`lab-open`),
    variants: 2,
    slot: 1.4,
    volume: 0.48,
    cooldown: 180,
  },
  "lab.drop": {
    src: sources(`lab-drop`),
    variants: 4,
    slot: 0.6,
    volume: 0.56,
    cooldown: 90,
    rate: [0.97, 1.03],
  },
};
export function spriteLayout(config) {
  if (config.loopRegion) {
    return {
      sprite: {
        loop: [...config.loopRegion, true],
      },
      groups: {
        loop: [`loop`],
      },
    };
  }
  if (!config.variants || !config.slot) {
    return null;
  }
  const counts =
    typeof config.variants === `number`
      ? {
          take: config.variants,
        }
      : config.variants;
  const slot = Math.round(config.slot * 1e3);
  const sprite = {};
  const groups = {};
  let index = 0;
  for (const [group, count] of Object.entries(counts)) {
    groups[group] = [];
    for (let take = 0; take < count; take += 1) {
      const name = `${group}-${take}`;
      sprite[name] = [index * slot, slot];
      groups[group].push(name);
      index += 1;
    }
  }
  return {
    sprite,
    groups,
  };
}
export function ambientTrackForPath(pathname) {
  if (pathname?.startsWith(`/lab`)) {
    return `ambient.lab`;
  }
  if (pathname?.startsWith(`/work`)) {
    return `ambient.work`;
  }
  return `ambient.home`;
}
