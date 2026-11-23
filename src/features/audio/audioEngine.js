import { AUDIO_TRACKS, spriteLayout } from "./audioCatalog.js";
import { setAudioPreferences } from "./audioPreferences.js";
const MASTER_VOLUME = 0.7;
const AMBIENT_INTRO_MS = 2400;
const AMBIENT_CROSSFADE_MS = 1600;
const AMBIENT_RESUME_MS = 700;
const AMBIENT_RELEASE_MS = 450;
const AMBIENT_CACHE_SIZE = 2;
const LATE_PLAY_MS = 150;
const STOP_FADE_MS = 120;
const PAN_SPREAD = 0.35;
const WIND_LOOP_SECONDS = 4;
const WIND_MOTION = {
  floor: 0.3,
  full: 3.5,
};
const WIND_AIR = {
  gain: 0.05,
  from: 300,
  to: 650,
  q: 0.6,
};
const WIND_PAPER = {
  gain: 0.012,
  from: 900,
  to: 1400,
  q: 0.9,
};
const WIND_TONE = {
  from: 1100,
  to: 1800,
};
const WIND_ATTACK = 0.12;
const WIND_RELEASE = 0.3;
const WIND_STALE_MS = 250;
const START_EVENTS = [`pointerdown`, `pointerup`, `keydown`, `touchend`];
const LOADER_POLL_MS = 500;
const SCENE_POLL_MS = 250;
const SILENT_WAV = `data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==`;
const CODECS = {
  webm: `audio/webm; codecs="opus"`,
  mp3: `audio/mpeg`,
};
const EFFECTS = Object.keys(AUDIO_TRACKS).filter((name) => AUDIO_TRACKS[name].kind !== `ambient`);
const INTRO_EFFECT = `intro.print`;
const tracks = new Map();
const voices = new Set();
const lastPlayed = new Map();
const windSources = new Map();
const stopNothing = () => {};
let library = null;
let libraryPromise = null;
let autoplayProbe = null;
let codecSupport = null;
let enabled = false;
let visible = true;
let started = false;
let contextRan = false;
let watchedContext = null;
let ambientTarget = null;
let pendingAmbient = null;
let introduced = false;
let nextFade = AMBIENT_INTRO_MS;
let gestureArmed = false;
let warmed = false;
let sceneSettled = false;
let scenePoll = 0;
let wind = null;
let windTimer = 0;
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function randomRate(range) {
  if (!Array.isArray(range)) {
    return range ?? 1;
  }
  return range[0] + Math.random() * (range[1] - range[0]);
}
function hasUserActivation() {
  return navigator.userActivation?.hasBeenActive === true;
}
function autoplayAllowed() {
  autoplayProbe ??= new Promise((resolve) => {
    const policy = navigator.getAutoplayPolicy?.(`audiocontext`);
    if (policy) {
      resolve(policy === `allowed`);
      return;
    }
    const probe = new Audio(SILENT_WAV);
    probe.play().then(
      () => {
        probe.pause();
        resolve(true);
      },
      () => resolve(false),
    );
  });
  return autoplayProbe;
}
function loadLibrary() {
  if (typeof window === `undefined`) {
    return Promise.resolve(null);
  }
  libraryPromise ??= import(`../../../vendor/howler/index.js`)
    .then((module) => module.default())
    .then((module) => {
      library = module.Howl ? module : module.default;
      return library;
    })
    .catch(() => {
      libraryPromise = null;
      return null;
    });
  return libraryPromise;
}
function playableSources(config) {
  if (!codecSupport) {
    const probe = document.createElement(`audio`);
    codecSupport = Object.fromEntries(
      Object.entries(CODECS).map(([extension, type]) => [
        extension,
        probe.canPlayType(type) !== ``,
      ]),
    );
  }
  return config.src.filter((src) => codecSupport[src.slice(src.lastIndexOf(`.`) + 1)]);
}
function load(name) {
  const cached = tracks.get(name);
  if (cached) {
    cached.usedAt = performance.now();
    return cached;
  }
  const config = AUDIO_TRACKS[name];
  const sources = playableSources(config);
  const track = {
    name,
    config,
    layout: spriteLayout(config),
    howl: null,
    recent: new Map(),
    usedAt: performance.now(),
  };
  tracks.set(name, track);
  track.ready = new Promise((resolve) => {
    const attempt = (index) => {
      if (index >= sources.length || tracks.get(name) !== track) {
        resolve(false);
        return;
      }
      const howl = new library.Howl({
        src: [sources[index]],
        sprite: track.layout?.sprite,
        volume: config.kind === `ambient` ? 0 : (config.volume ?? 1),
        onload: () => resolve(true),
        onloaderror: () => {
          howl.unload();
          attempt(index + 1);
        },
      });
      track.howl = howl;
    };
    attempt(0);
  });
  return track;
}
function watchContext() {
  const context = library.Howler.ctx;
  if (!context || context === watchedContext) {
    return;
  }
  watchedContext = context;
  const update = () => {
    if (contextRan || context.state !== `running`) {
      return;
    }
    contextRan = true;
    syncAmbient();
  };
  context.addEventListener(`statechange`, update);
  update();
}
function start() {
  if (started || !library || !enabled) {
    return;
  }
  started = true;
  disarmGestureStart();
  preloadAmbient();
  load(INTRO_EFFECT);
  afterLoader(() => {
    if (enabled) {
      for (const name of EFFECTS) {
        load(name);
      }
    }
  });
  library.Howler.volume(MASTER_VOLUME);
  watchContext();
  if (library.Howler.ctx?.state === `suspended`) {
    library.Howler.ctx.resume().catch(() => {});
  }
  syncAmbient();
}
function startWhenAllowed() {
  if (started || !library || !enabled) {
    return;
  }
  if (hasUserActivation()) {
    start();
    return;
  }
  autoplayAllowed().then((allowed) => {
    if (allowed) {
      start();
    }
  });
}
function onStartGesture() {
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    return;
  }
  start();
}
function armGestureStart() {
  if (gestureArmed || started) {
    return;
  }
  gestureArmed = true;
  for (const type of START_EVENTS) {
    document.addEventListener(type, onStartGesture, {
      capture: true,
      passive: true,
    });
  }
}
function disarmGestureStart() {
  if (!gestureArmed) {
    return;
  }
  gestureArmed = false;
  for (const type of START_EVENTS) {
    document.removeEventListener(type, onStartGesture, {
      capture: true,
    });
  }
}
function sceneLoaded() {
  const loader = document.querySelector(`.opening-loader`);
  return !loader || (loader.hasAttribute(`data-done`) && !loader.hasAttribute(`data-cover`));
}
function ambientMayLoad() {
  if (sceneSettled) {
    return true;
  }
  if (sceneLoaded()) {
    sceneSettled = true;
    return true;
  }
  scenePoll ||= window.setTimeout(() => {
    scenePoll = 0;
    if (!ambientMayLoad()) {
      return;
    }
    preloadAmbient();
    syncAmbient();
  }, SCENE_POLL_MS);
  return false;
}
function preloadAmbient() {
  if (started && enabled && ambientTarget && ambientMayLoad()) {
    load(ambientTarget);
  }
}
function afterLoader(callback) {
  const idle = window.requestIdleCallback ?? ((next) => window.setTimeout(next, 400));
  const check = () => {
    if (document.querySelector(`.opening-loader`)) {
      window.setTimeout(() => idle(check), LOADER_POLL_MS);
      return;
    }
    callback();
  };
  idle(check);
}
function warmCache() {
  if (warmed) {
    return;
  }
  warmed = true;
  afterLoader(() => {
    if (started || !enabled) {
      return;
    }
    for (const name of [ambientTarget, ...EFFECTS]) {
      const [src] = name ? playableSources(AUDIO_TRACKS[name]) : [];
      if (src) {
        fetch(src, {
          priority: `low`,
        })
          .then((response) => response.arrayBuffer())
          .catch(() => {});
      }
    }
  });
}
function beginAmbient(track, fadeMs) {
  const { howl, config } = track;
  const [offset, length] = config.loopRegion;
  const id = howl.play(`loop`);
  howl.seek((offset + Math.random() * length) / 1e3, id);
  howl.fade(0, config.volume ?? 1, fadeMs, id);
  const voice = {
    name: track.name,
    track,
    id,
    retiring: false,
  };
  voices.add(voice);
  introduced = true;
  return voice;
}
function retireAmbient(keep, fadeMs) {
  for (const voice of voices) {
    if (voice === keep || voice.retiring) {
      continue;
    }
    voice.retiring = true;
    const { howl } = voice.track;
    howl.fade(howl.volume(voice.id), 0, fadeMs, voice.id);
    window.setTimeout(() => {
      howl.stop(voice.id);
      voices.delete(voice);
      evictAmbients();
    }, fadeMs + 80);
  }
}
function evictAmbients() {
  const ambients = [...tracks.values()]
    .filter((track) => track.config.kind === `ambient`)
    .sort((a, b) => b.usedAt - a.usedAt);
  for (const track of ambients.slice(AMBIENT_CACHE_SIZE)) {
    const busy =
      track.name === ambientTarget ||
      track.name === pendingAmbient ||
      [...voices].some((voice) => voice.track === track);
    if (busy) {
      continue;
    }
    tracks.delete(track.name);
    track.howl?.unload();
  }
}
function syncAmbient() {
  if (!started) {
    return;
  }
  const wanted = enabled && visible && contextRan && ambientMayLoad() ? ambientTarget : null;
  const current = wanted
    ? [...voices].find((voice) => !voice.retiring && voice.name === wanted)
    : null;
  if (!wanted || current) {
    pendingAmbient = null;
    retireAmbient(current, wanted ? AMBIENT_CROSSFADE_MS : AMBIENT_RELEASE_MS);
    return;
  }
  if (pendingAmbient === wanted) {
    return;
  }
  pendingAmbient = wanted;
  const track = load(wanted);
  track.ready.then((loaded) => {
    if (pendingAmbient !== wanted) {
      return;
    }
    pendingAmbient = null;
    if (!loaded) {
      retireAmbient(null, AMBIENT_RELEASE_MS);
      return;
    }
    const replacing = [...voices].some((voice) => !voice.retiring);
    const voice = beginAmbient(track, replacing ? AMBIENT_CROSSFADE_MS : nextFade);
    retireAmbient(voice, AMBIENT_CROSSFADE_MS);
    evictAmbients();
  });
}
function pickSprite(track, variant) {
  const { groups } = track.layout;
  const group = groups[variant] ? variant : Object.keys(groups)[0];
  const names = groups[group];
  const previous = track.recent.get(group);
  const choices = names.length > 1 ? names.filter((name) => name !== previous) : names;
  const sprite = choices[Math.floor(Math.random() * choices.length)];
  track.recent.set(group, sprite);
  return sprite;
}
function playTake(track, options) {
  const { howl, config, layout } = track;
  const id = howl.play(layout ? pickSprite(track, options.variant) : undefined);
  if (id == null) {
    return null;
  }
  const rate = options.rate ?? randomRate(config.rate);
  if (rate !== 1) {
    howl.rate(rate, id);
  }
  if (options.volume != null) {
    howl.volume(clamp(options.volume, 0, 1) * (config.volume ?? 1), id);
  }
  if (options.pan) {
    howl.stereo(clamp(options.pan, -1, 1), id);
  }
  return {
    howl,
    id,
  };
}
function windNoise(context) {
  const rate = context.sampleRate;
  const frames = Math.round(WIND_LOOP_SECONDS * rate);
  const overlap = Math.round(0.25 * rate);
  const buffer = context.createBuffer(2, frames, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const pink = pinkNoise(frames + overlap);
    const data = buffer.getChannelData(channel);
    data.set(pink.subarray(0, frames));
    for (let n = 0; n < overlap; n += 1) {
      const angle = (n / overlap) * Math.PI * 0.5;
      data[n] = pink[n] * Math.sin(angle) + pink[frames + n] * Math.cos(angle);
    }
  }
  return buffer;
}
function pinkNoise(length) {
  const out = new Float32Array(length);
  const b = new Float64Array(7);
  let energy = 0;
  for (let n = 0; n < length; n += 1) {
    const white = Math.random() * 2 - 1;
    b[0] = 0.99886 * b[0] + white * 0.0555179;
    b[1] = 0.99332 * b[1] + white * 0.0750759;
    b[2] = 0.969 * b[2] + white * 0.153852;
    b[3] = 0.8665 * b[3] + white * 0.3104856;
    b[4] = 0.55 * b[4] + white * 0.5329522;
    b[5] = -0.7616 * b[5] - white * 0.016898;
    out[n] = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + white * 0.5362;
    b[6] = white * 0.115926;
    energy += out[n] * out[n];
  }
  const gain = 0.25 / Math.sqrt(energy / Math.max(1, length));
  for (let n = 0; n < length; n += 1) {
    out[n] *= gain;
  }
  return out;
}
function windBand(context, source, output, { from, q }) {
  const band = context.createBiquadFilter();
  band.type = `bandpass`;
  band.frequency.value = from;
  band.Q.value = q;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(band).connect(gain).connect(output);
  return {
    band,
    gain,
  };
}
function windVoice() {
  const context = library?.Howler.ctx;
  const output = library?.Howler.masterGain;
  if (!context || !output) {
    return null;
  }
  if (wind?.context === context) {
    return wind;
  }
  const source = context.createBufferSource();
  source.buffer = windNoise(context);
  source.loop = true;
  const panner = context.createStereoPanner?.() ?? null;
  if (panner) {
    panner.connect(output);
  }
  const tone = context.createBiquadFilter();
  tone.type = `lowpass`;
  tone.frequency.value = WIND_TONE.from;
  tone.Q.value = 0;
  tone.connect(panner ?? output);
  wind = {
    context,
    panner,
    tone,
    air: windBand(context, source, tone, WIND_AIR),
    paper: windBand(context, source, tone, WIND_PAPER),
    level: 0,
    pan: 0,
  };
  source.start(0, Math.random() * WIND_LOOP_SECONDS);
  return wind;
}
function syncWind() {
  const now = performance.now();
  let motion = 0;
  let pan = 0;
  for (const [source, report] of windSources) {
    if (now - report.at > WIND_STALE_MS) {
      windSources.delete(source);
    } else if (report.motion > motion) {
      motion = report.motion;
      pan = report.pan;
    }
  }
  const audible = enabled && visible && started && contextRan;
  const level = audible
    ? clamp((motion - WIND_MOTION.floor) / (WIND_MOTION.full - WIND_MOTION.floor), 0, 1)
    : 0;
  if (!wind && level === 0) {
    return;
  }
  const voice = windVoice();
  if (!voice || (Math.abs(level - voice.level) < 0.002 && Math.abs(pan - voice.pan) < 0.01)) {
    return;
  }
  const time = voice.context.currentTime;
  const settle = level > voice.level ? WIND_ATTACK : WIND_RELEASE;
  voice.air.gain.gain.setTargetAtTime(WIND_AIR.gain * level ** 1.5, time, settle);
  voice.air.band.frequency.setTargetAtTime(
    WIND_AIR.from + (WIND_AIR.to - WIND_AIR.from) * level,
    time,
    settle,
  );
  voice.paper.gain.gain.setTargetAtTime(WIND_PAPER.gain * level ** 3, time, settle);
  voice.paper.band.frequency.setTargetAtTime(
    WIND_PAPER.from + (WIND_PAPER.to - WIND_PAPER.from) * level,
    time,
    settle,
  );
  voice.tone.frequency.setTargetAtTime(
    WIND_TONE.from + (WIND_TONE.to - WIND_TONE.from) * level,
    time,
    settle,
  );
  voice.panner?.pan.setTargetAtTime(pan, time, 0.12);
  voice.level = level;
  voice.pan = pan;
}
function expireWind() {
  windTimer = 0;
  syncWind();
  if (windSources.size) {
    windTimer = window.setTimeout(expireWind, WIND_STALE_MS);
  }
}
export function prepareAudio() {
  return loadLibrary().then((loaded) => {
    if (loaded) {
      startWhenAllowed();
    }
    return loaded;
  });
}
export function applyAudioPreferences(preferences) {
  const wasEnabled = enabled;
  enabled = Boolean(preferences.enabled);
  if (enabled && !wasEnabled) {
    nextFade = AMBIENT_INTRO_MS;
  }
  if (!enabled) {
    disarmGestureStart();
  } else if (!started && typeof window !== `undefined`) {
    armGestureStart();
    warmCache();
    startWhenAllowed();
  }
  syncAmbient();
  syncWind();
}
export function unlockAudio() {
  if (library) {
    start();
  } else {
    loadLibrary().then(start);
  }
}
export function setSoundEnabled(on) {
  const preferences = {
    enabled: Boolean(on),
  };
  setAudioPreferences(preferences);
  applyAudioPreferences(preferences);
  if (!preferences.enabled) {
    return;
  }
  unlockAudio();
  playSound(`ui.select`);
}
export function playSound(name, options = {}) {
  const config = AUDIO_TRACKS[name];
  if (!config || config.kind === `ambient`) {
    return stopNothing;
  }
  if (!enabled || !visible || !started || !contextRan) {
    return stopNothing;
  }
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < (config.cooldown ?? 0)) {
    return stopNothing;
  }
  lastPlayed.set(name, now);
  const track = load(name);
  const delay = Math.max(0, options.delay ?? 0);
  const due = now + delay;
  let stopped = false;
  let take = null;
  const fire = (loaded = true) => {
    if (stopped || !loaded || !enabled || !visible || performance.now() - due > LATE_PLAY_MS) {
      return;
    }
    take = playTake(track, options);
  };
  const whenReady = () => {
    if (track.howl?.state() === `loaded`) {
      fire();
    } else {
      track.ready.then(fire);
    }
  };
  if (delay > 0) {
    window.setTimeout(whenReady, delay);
  } else {
    whenReady();
  }
  return () => {
    stopped = true;
    if (!take) {
      return;
    }
    const { howl, id } = take;
    take = null;
    if (!howl.playing(id)) {
      return;
    }
    howl.fade(howl.volume(id), 0, STOP_FADE_MS, id);
    window.setTimeout(() => howl.stop(id), STOP_FADE_MS);
  };
}
export function panForViewX(x, spread = PAN_SPREAD) {
  return Number.isFinite(x) ? clamp(x, -1, 1) * spread : 0;
}
export function panForClientX(clientX, spread = PAN_SPREAD) {
  if (typeof window === `undefined` || !window.innerWidth) {
    return 0;
  }
  return panForViewX((clientX / window.innerWidth) * 2 - 1, spread);
}
export function setWindActivity(source, motion, clientX) {
  if (typeof window === `undefined`) {
    return;
  }
  if (motion > 0) {
    windSources.set(source, {
      motion,
      pan: panForClientX(clientX),
      at: performance.now(),
    });
    if (!windTimer) {
      windTimer = window.setTimeout(expireWind, WIND_STALE_MS);
    }
  } else if (!windSources.delete(source) && !wind?.level) {
    return;
  }
  syncWind();
}
export function setAmbientTrack(name) {
  ambientTarget = name ?? null;
  syncAmbient();
}
export function setAudioActive(nextActive) {
  const next = Boolean(nextActive);
  if (next && !visible && introduced) {
    nextFade = AMBIENT_RESUME_MS;
  }
  visible = next;
  syncAmbient();
  syncWind();
}
