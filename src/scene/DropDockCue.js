import { Mesh, MeshBasicMaterial, uniform } from "../engine/index.js";
import { gsap, ease, whenMotion } from "../shared/motion.js";
import { createDropRim, nearestRimProgress } from "../features/polaroids/dropRimGeometry.js";
import { noRaycast } from "./runtime/events.js";
export class DropDockCue {
  constructor(ctx, props) {
    this.reveal = {
      start: uniform(0),
      draw: uniform(0),
      opacity: uniform(0),
    };
    const material = new MeshBasicMaterial({
      color: `#fff0ce`,
    });
    material.transparent = true;
    material.depthWrite = false;
    material.toneMapped = false;
    material.hooks = {
      key: `drop-dock-cue`,
      attributes: {
        rimPosition: {
          type: `f32`,
        },
      },
      varyings: {
        rim: `f32`,
      },
      vertex: `  v.rim = attr.rimPosition;`,
      uniforms: {
        rimStart: this.reveal.start,
        rimDraw: this.reveal.draw,
        rimOpacity: this.reveal.opacity,
      },
      opacityNode:
        `(1.0 - smoothstep(material.rimDraw * 0.5, material.rimDraw * 0.5 + 0.008, ` +
        `min(abs(v.rim - material.rimStart), 1.0 - abs(v.rim - material.rimStart)))) * material.rimOpacity`,
    };
    this.material = material;
    this.mesh = new Mesh(undefined, material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 30;
    this.mesh.raycast = noRaycast;
    this.object = this.mesh;
    this.hinting = false;
    this.props = {};
    this.update(props);
  }
  update(props) {
    const previous = this.props;
    this.props = props;
    const { zone, floorY, active, entry, hint = false } = props;
    if (zone !== previous.zone) {
      this.rim?.geometry.dispose();
      this.rim = createDropRim(zone);
      this.mesh.geometry = this.rim.geometry;
    }
    this.mesh.position.set(zone.x, floorY + 0.008, zone.z);
    const deps = [active, entry, hint, this.rim, zone.x, zone.z];
    if (this.deps && deps.every((value, i) => Object.is(value, this.deps[i]))) {
      return;
    }
    this.deps = deps;
    gsap.killTweensOf(this.reveal.draw);
    gsap.killTweensOf(this.reveal.opacity);
    const mesh = this.mesh;
    const reveal = this.reveal;
    if (active) {
      mesh.visible = true;
      this.hinting = hint;
      gsap.set(reveal.start, {
        value: nearestRimProgress(this.rim, {
          x: (entry?.x ?? zone.x) - zone.x,
          z: (entry?.z ?? zone.z) - zone.z,
        }),
      });
      gsap.fromTo(
        reveal.draw,
        {
          value: 0,
        },
        {
          value: 1,
          duration: whenMotion(hint ? 1.1 : 0.42),
          ease: ease.thomas,
        },
      );
      gsap.fromTo(
        reveal.opacity,
        {
          value: 0,
        },
        {
          value: hint ? 0.28 : 0.32,
          duration: whenMotion(hint ? 0.3 : 0.1),
          ease: `power2.out`,
        },
      );
    } else {
      gsap.to(reveal.opacity, {
        value: 0,
        duration: whenMotion(this.hinting ? 0.7 : 0.18),
        overwrite: true,
        onComplete: () => {
          mesh.visible = false;
        },
      });
    }
  }
  dispose() {
    gsap.killTweensOf(this.reveal.draw);
    gsap.killTweensOf(this.reveal.opacity);
    this.rim?.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
