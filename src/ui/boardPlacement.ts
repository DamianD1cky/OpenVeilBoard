import { findFreePosition, paperAspect } from "../domain/geometry.js";
import type { CardStyle } from "../domain/types";
export function boardPlacement(
  style: CardStyle,
  scene: any,
  preferred = { x: 0, y: 0 },
) {
  if (scene && !scene.disposed)
    return scene.field.freePosition(style, preferred);
  const table = document.querySelector<HTMLElement>(".fallback-board");
  if (!table) return preferred;
  const rect = table.getBoundingClientRect();
  const width =
    innerWidth <= 700
      ? innerWidth * 0.3
      : Math.max(100, Math.min(190, innerWidth * 0.14));
  const height = width / paperAspect(style);
  const others = [...table.querySelectorAll<HTMLElement>(".fallback-card")].map(
    (card) => {
      const r = card.getBoundingClientRect();
      return {
        id: card.dataset.noteId,
        x: r.x + r.width / 2 - rect.x - rect.width / 2,
        y: r.y + r.height / 2 - rect.y - rect.height / 2,
        width: r.width,
        height: r.height,
        rotation: 0,
      };
    },
  );
  const reserved = [".archive-well-2d", ".surface-clock-2d"].flatMap(
    (selector) => {
      const element = table.querySelector<HTMLElement>(selector);
      if (!element) return [];
      const r = element.getBoundingClientRect();
      return [
        {
          id: selector,
          x: r.x + r.width / 2 - rect.x - rect.width / 2,
          y: r.y + r.height / 2 - rect.y - rect.height / 2,
          width: r.width,
          height: r.height,
          rotation: 0,
        },
      ];
    },
  );
  const p = findFreePosition(
    { id: "new", width: width + 8, height: height + 8, rotation: 0 },
    others,
    {
      x: rect.width / 2 - width / 2 - 10,
      y: rect.height / 2 - height / 2 - 10,
    },
    reserved,
    { x: preferred.x * rect.width, y: preferred.y * rect.height },
  );
  return { x: p.x / rect.width, y: p.y / rect.height };
}
