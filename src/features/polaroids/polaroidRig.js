import {
  Bone,
  Float32BufferAttribute,
  PlaneGeometry,
  Skeleton,
  Uint16BufferAttribute,
  Vector3,
} from "../../engine/index.js";
const CORNERS = [
  {
    name: `corner_bl`,
    x: -1,
    y: -1,
  },
  {
    name: `corner_br`,
    x: 1,
    y: -1,
  },
  {
    name: `corner_tl`,
    x: -1,
    y: 1,
  },
  {
    name: `corner_tr`,
    x: 1,
    y: 1,
  },
];
const Y_AXIS = new Vector3(0, 1, 0);
const outward = new Vector3();
export function createPolaroidRig(
  width,
  height,
  { segmentsX = 20, segmentsY = 24, velocity = 0.14 } = {},
) {
  const geometry = new PlaneGeometry(width, height, segmentsX, segmentsY);
  const hw = width / 2;
  const hh = height / 2;
  const restLength = Math.hypot(hw, hh) * 0.22;
  const root = new Bone();
  root.name = `root`;
  const cornerBones = CORNERS.map(({ name, x, y }) => {
    const wrapper = new Bone();
    wrapper.name = `${name}_static`;
    wrapper.position.set(x * hw * 0.62, y * hh * 0.62, 0);
    wrapper.quaternion.setFromUnitVectors(Y_AXIS, outward.set(x * hw, y * hh, 0).normalize());
    root.add(wrapper);
    const bone = new Bone();
    bone.name = name;
    bone.position.set(0, restLength, 0);
    bone.userData.wiggleVelocity = velocity;
    wrapper.add(bone);
    return bone;
  });
  const bones = [root, ...cornerBones];
  const skeleton = new Skeleton(bones);
  const positions = geometry.attributes.position;
  const count = positions.count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const u = hw > 0 ? positions.getX(i) / hw : 0;
    const v = hh > 0 ? positions.getY(i) / hh : 0;
    const su = (u + 1) * 0.5;
    const sv = (v + 1) * 0.5;
    const corner = [(1 - su) * (1 - sv), su * (1 - sv), (1 - su) * sv, su * sv];
    const edge = Math.min(1, Math.hypot(u, v));
    const flap = edge ** 1.85;
    const ranked = corner
      .map((weight, index) => ({
        weight: weight * flap,
        index,
      }))
      .sort((a, b) => b.weight - a.weight);
    const chosen = [
      {
        bone: 0,
        weight: 1 - flap,
      },
      {
        bone: ranked[0].index + 1,
        weight: ranked[0].weight,
      },
      {
        bone: ranked[1].index + 1,
        weight: ranked[1].weight,
      },
      {
        bone: ranked[2].index + 1,
        weight: ranked[2].weight,
      },
    ];
    const sum = chosen.reduce((total, item) => total + item.weight, 0) || 1;
    for (let k = 0; k < 4; k += 1) {
      indices[i * 4 + k] = chosen[k].bone;
      weights[i * 4 + k] = chosen[k].weight / sum;
    }
  }
  geometry.setAttribute(`skinIndex`, new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute(`skinWeight`, new Float32BufferAttribute(weights, 4));
  return {
    geometry,
    skeleton,
    root,
  };
}
