export const POLAROID_PLACEMENTS = {
  desktop: {
    about: {
      x: -0.73,
      y: -0.91,
      rotation: -9,
    },
    auremin: {
      x: 0.02,
      y: -0.82,
      rotation: 7,
    },
    cinnamon: {
      x: 0.76,
      y: -0.86,
      rotation: -6,
    },
    gielissen: {
      x: -0.78,
      y: 0.88,
      rotation: 8,
    },
    muuble: {
      x: -0.32,
      y: 0.03,
      rotation: -4,
    },
    spyker: {
      x: 0.76,
      y: 0.78,
      rotation: 9,
    },
    momiji: {
      x: 0.22,
      y: 0.88,
      rotation: -7,
    },
  },
  tablet: {
    about: {
      x: -0.77,
      y: -0.73,
      rotation: -7,
    },
    auremin: {
      x: 0.01,
      y: -0.85,
      rotation: 6,
    },
    cinnamon: {
      x: 0.78,
      y: -0.64,
      rotation: -5,
    },
    gielissen: {
      x: -0.78,
      y: 0.46,
      rotation: 7,
    },
    muuble: {
      x: -0.02,
      y: 0.04,
      rotation: -4,
    },
    spyker: {
      x: 0.78,
      y: 0.61,
      rotation: 8,
    },
    momiji: {
      x: -0.1,
      y: 0.88,
      rotation: -6,
    },
  },
  mobile: {
    about: {
      x: 0.05,
      y: 0.1,
      rotation: 6,
    },
    auremin: {
      x: -0.71,
      y: -0.91,
      rotation: -6,
    },
    cinnamon: {
      x: 0.76,
      y: -0.8,
      rotation: 5,
    },
    gielissen: {
      x: -0.96,
      y: 0.03,
      rotation: 7,
    },
    muuble: {
      x: 1,
      y: 0.21,
      rotation: -5,
    },
    spyker: {
      x: -0.66,
      y: 0.94,
      rotation: 6,
    },
    momiji: {
      x: 0.71,
      y: 1,
      rotation: -4,
    },
  },
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function placementDevice(pixelWidth) {
  return pixelWidth < 600 ? `mobile` : pixelWidth < 1100 ? `tablet` : `desktop`;
}
export function placementDefaults(device) {
  return Object.fromEntries(
    Object.entries(POLAROID_PLACEMENTS[device])
      .filter(([slug]) => slug !== `about`)
      .flatMap(([slug, pose]) => [
        [`${slug}X`, pose.x],
        [`${slug}Y`, pose.y],
        [`${slug}Rotation`, pose.rotation],
      ]),
  );
}
export function rotatedCardBounds(width, height, yaw) {
  return {
    halfWidth: (Math.abs(Math.cos(yaw)) * width + Math.abs(Math.sin(yaw)) * height) / 2,
    halfHeight: (Math.abs(Math.sin(yaw)) * width + Math.abs(Math.cos(yaw)) * height) / 2,
  };
}
export function homeCardWidth({ area, requestedWidth, aspect, device, count = 7 }) {
  const columns = device === `mobile` ? 2 : 3;
  const rows = Math.ceil(count / columns);
  const rowUnits = device === `desktop` ? rows * 0.6 + 0.05 : rows * 0.92 + 0.08;
  const bounds = rotatedCardBounds(1, 1 / aspect, (12 * Math.PI) / 180);
  return Math.max(
    0.025,
    Math.min(
      requestedWidth,
      (area.right - area.left) / (columns * bounds.halfWidth * 2 + 0.16),
      (area.bottom - area.top) / (rowUnits * bounds.halfHeight * 2 + 0.12),
    ),
  );
}
function seededRandom(seed) {
  let a = Number(seed) >>> 0;
  return () => {
    a += 1831565813;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cardBox(pose, width, height, padding = 0) {
  const { halfWidth, halfHeight } = rotatedCardBounds(width, height, pose.yaw);
  return {
    left: pose.x - halfWidth - padding,
    right: pose.x + halfWidth + padding,
    top: pose.z - halfHeight - padding,
    bottom: pose.z + halfHeight + padding,
  };
}
function overlapArea(a, b) {
  return (
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  );
}
function clearAnchor(poses, anchor, area, width, height, device) {
  const padding = width * (device === `mobile` ? -0.3 : 0.12);
  const protectedBox = cardBox(anchor, width, height, padding);
  const result = poses.map((pose) =>
    pose.slug === anchor.slug
      ? {
          ...pose,
          ...anchor,
        }
      : pose,
  );
  for (let index = 0; index < result.length; index += 1) {
    const pose = result[index];
    if (pose.slug === anchor.slug || !overlapArea(cardBox(pose, width, height), protectedBox)) {
      continue;
    }
    const { halfWidth, halfHeight } = rotatedCardBounds(width, height, pose.yaw);
    const left = area.left + halfWidth;
    const right = area.right - halfWidth;
    const top = area.top + halfHeight;
    const bottom = area.bottom - halfHeight;
    const xs = [pose.x, protectedBox.left - halfWidth, protectedBox.right + halfWidth];
    const zs = [pose.z, protectedBox.top - halfHeight, protectedBox.bottom + halfHeight];
    for (let step = 0; step <= 20; step += 1) {
      xs.push(left + ((right - left) * step) / 20);
      zs.push(top + ((bottom - top) * step) / 20);
    }
    let best = null;
    let bestScore = Infinity;
    for (const x of xs) {
      for (const z of zs) {
        const candidate = {
          ...pose,
          x: clamp(x, left, right),
          z: clamp(z, top, bottom),
        };
        const box = cardBox(candidate, width, height);
        if (overlapArea(box, protectedBox) > 1e-10) {
          continue;
        }
        const overlap = result.reduce(
          (total, other, otherIndex) =>
            otherIndex === index || other.slug === anchor.slug
              ? total
              : total + overlapArea(box, cardBox(other, width, height, Math.max(padding, 0) * 0.5)),
          0,
        );
        const distance = (candidate.x - pose.x) ** 2 + (candidate.z - pose.z) ** 2;
        const score = overlap * 1e3 + distance;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
    }
    if (best) {
      result[index] = best;
    }
  }
  return result;
}
export function arrangePolaroids({
  deck,
  area,
  width,
  height,
  device,
  controls = {},
  spread = 1,
  variation = 0,
  seed = 20260824,
  anchor,
}) {
  const defaults = POLAROID_PLACEMENTS[device] ?? POLAROID_PLACEMENTS.desktop;
  const random = seededRandom(seed);
  const centerX = (area.left + area.right) / 2;
  const centerZ = (area.top + area.bottom) / 2;
  const poses = deck.map((card, index) => {
    const fallback = defaults[card.slug] ?? {
      x: Math.cos(index * 2.39996) * 0.75,
      y: Math.sin(index * 2.39996) * 0.75,
      rotation: index % 2 ? 6 : -6,
    };
    const x = controls[`${card.slug}X`] ?? fallback.x;
    const y = controls[`${card.slug}Y`] ?? fallback.y;
    const degrees =
      (controls[`${card.slug}Rotation`] ?? fallback.rotation) + (random() - 0.5) * 8 * variation;
    const yaw = (degrees * Math.PI) / 180;
    const { halfWidth, halfHeight } = rotatedCardBounds(width, height, yaw);
    const maxX = Math.max(0, (area.right - area.left) / 2 - halfWidth);
    const maxZ = Math.max(0, (area.bottom - area.top) / 2 - halfHeight);
    return {
      ...card,
      x: centerX + clamp(x * spread + (random() - 0.5) * 0.18 * variation, -1, 1) * maxX,
      z: centerZ + clamp(y * spread + (random() - 0.5) * 0.18 * variation, -1, 1) * maxZ,
      yaw,
    };
  });
  return anchor ? clearAnchor(poses, anchor, area, width, height, device) : poses;
}
export function galleryCardLayout({
  deck,
  area,
  requestedWidth,
  aspect,
  pixelWidth,
  seed = 20260824,
}) {
  const phone = placementDevice(pixelWidth) === `mobile`;
  const columns = phone ? 2 : pixelWidth < 1100 ? 3 : Math.max(1, deck.length);
  const rows = Math.ceil(deck.length / columns);
  const gap = 0.16;
  const rotated = rotatedCardBounds(1, 1 / aspect, (4 * Math.PI) / 180);
  const width = phone
    ? requestedWidth
    : Math.min(
        requestedWidth,
        (area.right - area.left) / (columns * (rotated.halfWidth * 2 + gap)),
        (area.bottom - area.top) / (rows * (rotated.halfHeight * 2 + gap)),
      );
  const fitStep = (span, extent, count) =>
    count > 1 ? Math.max(0, (span - width * extent * 2) / (count - 1)) : Infinity;
  const stepX = Math.min(
    width * (rotated.halfWidth * 2 + gap),
    phone ? fitStep(area.right - area.left, rotated.halfWidth, columns) : Infinity,
  );
  const stepZ = Math.min(
    width * (rotated.halfHeight * 2 + gap),
    phone ? fitStep(area.bottom - area.top, rotated.halfHeight, rows) : Infinity,
  );
  const centerX = (area.left + area.right) / 2;
  const lowerBy = Math.min(
    (width / aspect) * 0.4,
    Math.max(0, (area.bottom - area.top - (rows - 1) * stepZ) / 2 - width * rotated.halfHeight),
  );
  const centerZ = (area.top + area.bottom) / 2 + lowerBy;
  const random = seededRandom(seed);
  const poses = Object.fromEntries(
    deck.map((card, index) => {
      const row = Math.floor(index / columns);
      const inRow = Math.min(columns, deck.length - row * columns);
      return [
        card.slug,
        {
          ...card,
          x: centerX + ((index % columns) - (inRow - 1) / 2) * stepX,
          z: centerZ + (row - (rows - 1) / 2) * stepZ,
          yaw: ((random() - 0.5) * 8 * Math.PI) / 180,
          lift: pixelWidth < 1100 ? 0.035 : 0.12,
        },
      ];
    }),
  );
  return {
    poses,
    width,
    columns,
    rows,
    stepX,
    stepZ,
  };
}
