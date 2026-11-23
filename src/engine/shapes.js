import { BufferGeometry, Float32BufferAttribute } from "./geometry.js";
import { MathUtils, Matrix4, Vector2, Vector3 } from "./math.js";
export class Curve {
  constructor() {
    this.type = `Curve`;
    this.arcLengthDivisions = 200;
    this.needsUpdate = false;
    this.cacheArcLengths = null;
  }
  getPoint() {
    throw new Error(`Curve.getPoint() not implemented`);
  }
  getPointAt(u, target) {
    return this.getPoint(this.getUtoTmapping(u), target);
  }
  getPoints(divisions = 5) {
    const points = [];
    for (let d = 0; d <= divisions; d++) {
      points.push(this.getPoint(d / divisions));
    }
    return points;
  }
  getSpacedPoints(divisions = 5) {
    const points = [];
    for (let d = 0; d <= divisions; d++) {
      points.push(this.getPointAt(d / divisions));
    }
    return points;
  }
  getLength() {
    const lengths = this.getLengths();
    return lengths[lengths.length - 1];
  }
  getLengths(divisions = this.arcLengthDivisions) {
    if (
      this.cacheArcLengths &&
      this.cacheArcLengths.length === divisions + 1 &&
      !this.needsUpdate
    ) {
      return this.cacheArcLengths;
    }
    this.needsUpdate = false;
    const cache = [];
    let current;
    let last = this.getPoint(0);
    let sum = 0;
    cache.push(0);
    for (let p = 1; p <= divisions; p++) {
      current = this.getPoint(p / divisions);
      sum += current.distanceTo(last);
      cache.push(sum);
      last = current;
    }
    this.cacheArcLengths = cache;
    return cache;
  }
  updateArcLengths() {
    this.needsUpdate = true;
    this.getLengths();
  }
  getUtoTmapping(u, distance) {
    const arcLengths = this.getLengths();
    let i = 0;
    const il = arcLengths.length;
    const targetArcLength = distance ?? u * arcLengths[il - 1];
    let low = 0;
    let high = il - 1;
    let comparison;
    while (low <= high) {
      i = Math.floor(low + (high - low) / 2);
      comparison = arcLengths[i] - targetArcLength;
      if (comparison < 0) {
        low = i + 1;
      } else if (comparison > 0) {
        high = i - 1;
      } else {
        high = i;
        break;
      }
    }
    i = high;
    if (arcLengths[i] === targetArcLength) {
      return i / (il - 1);
    }
    const lengthBefore = arcLengths[i];
    const lengthAfter = arcLengths[i + 1];
    const segmentLength = lengthAfter - lengthBefore;
    const segmentFraction = (targetArcLength - lengthBefore) / segmentLength;
    return (i + segmentFraction) / (il - 1);
  }
  getTangent(t, optionalTarget) {
    const delta = 1e-4;
    let t1 = t - delta;
    let t2 = t + delta;
    if (t1 < 0) {
      t1 = 0;
    }
    if (t2 > 1) {
      t2 = 1;
    }
    const pt1 = this.getPoint(t1);
    const pt2 = this.getPoint(t2);
    const tangent = optionalTarget || (pt1.isVector2 ? new Vector2() : new Vector3());
    tangent.copy(pt2).sub(pt1).normalize();
    return tangent;
  }
  getTangentAt(u, optionalTarget) {
    return this.getTangent(this.getUtoTmapping(u), optionalTarget);
  }
  computeFrenetFrames(segments, closed) {
    const normal = new Vector3();
    const tangents = [];
    const normals = [];
    const binormals = [];
    const vec = new Vector3();
    const mat = new Matrix4();
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      tangents[i] = this.getTangentAt(u, new Vector3());
    }
    normals[0] = new Vector3();
    binormals[0] = new Vector3();
    let min = Number.MAX_VALUE;
    const tx = Math.abs(tangents[0].x);
    const ty = Math.abs(tangents[0].y);
    const tz = Math.abs(tangents[0].z);
    if (tx <= min) {
      min = tx;
      normal.set(1, 0, 0);
    }
    if (ty <= min) {
      min = ty;
      normal.set(0, 1, 0);
    }
    if (tz <= min) {
      normal.set(0, 0, 1);
    }
    vec.crossVectors(tangents[0], normal).normalize();
    normals[0].crossVectors(tangents[0], vec);
    binormals[0].crossVectors(tangents[0], normals[0]);
    for (let i = 1; i <= segments; i++) {
      normals[i] = normals[i - 1].clone();
      binormals[i] = binormals[i - 1].clone();
      vec.crossVectors(tangents[i - 1], tangents[i]);
      if (vec.length() > Number.EPSILON) {
        vec.normalize();
        const theta = Math.acos(MathUtils.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
        normals[i].applyMatrix4(mat.makeRotationAxis(vec, theta));
      }
      binormals[i].crossVectors(tangents[i], normals[i]);
    }
    if (closed === true) {
      let theta = Math.acos(MathUtils.clamp(normals[0].dot(normals[segments]), -1, 1));
      theta /= segments;
      if (tangents[0].dot(vec.crossVectors(normals[0], normals[segments])) > 0) {
        theta = -theta;
      }
      for (let i = 1; i <= segments; i++) {
        normals[i].applyMatrix4(mat.makeRotationAxis(tangents[i], theta * i));
        binormals[i].crossVectors(tangents[i], normals[i]);
      }
    }
    return {
      tangents,
      normals,
      binormals,
    };
  }
}
export class EllipseCurve extends Curve {
  constructor(
    aX = 0,
    aY = 0,
    xRadius = 1,
    yRadius = 1,
    aStartAngle = 0,
    aEndAngle = Math.PI * 2,
    aClockwise = false,
    aRotation = 0,
  ) {
    super();
    this.type = `EllipseCurve`;
    this.aX = aX;
    this.aY = aY;
    this.xRadius = xRadius;
    this.yRadius = yRadius;
    this.aStartAngle = aStartAngle;
    this.aEndAngle = aEndAngle;
    this.aClockwise = aClockwise;
    this.aRotation = aRotation;
  }
  getPoint(t, optionalTarget = new Vector2()) {
    const point = optionalTarget;
    const twoPi = Math.PI * 2;
    let deltaAngle = this.aEndAngle - this.aStartAngle;
    const samePoints = Math.abs(deltaAngle) < Number.EPSILON;
    while (deltaAngle < 0) {
      deltaAngle += twoPi;
    }
    while (deltaAngle > twoPi) {
      deltaAngle -= twoPi;
    }
    if (deltaAngle < Number.EPSILON) {
      deltaAngle = samePoints ? 0 : twoPi;
    }
    if (this.aClockwise === true && !samePoints) {
      if (deltaAngle === twoPi) {
        deltaAngle = -twoPi;
      } else {
        deltaAngle = deltaAngle - twoPi;
      }
    }
    const angle = this.aStartAngle + t * deltaAngle;
    let x = this.aX + this.xRadius * Math.cos(angle);
    let y = this.aY + this.yRadius * Math.sin(angle);
    if (this.aRotation !== 0) {
      const cos = Math.cos(this.aRotation);
      const sin = Math.sin(this.aRotation);
      const tx = x - this.aX;
      const ty = y - this.aY;
      x = tx * cos - ty * sin + this.aX;
      y = tx * sin + ty * cos + this.aY;
    }
    return point.set(x, y);
  }
}
EllipseCurve.prototype.isEllipseCurve = true;
export class ArcCurve extends EllipseCurve {
  constructor(aX, aY, aRadius, aStartAngle, aEndAngle, aClockwise) {
    super(aX, aY, aRadius, aRadius, aStartAngle, aEndAngle, aClockwise);
    this.type = `ArcCurve`;
  }
}
export class LineCurve extends Curve {
  constructor(v1 = new Vector2(), v2 = new Vector2()) {
    super();
    this.type = `LineCurve`;
    this.v1 = v1;
    this.v2 = v2;
  }
  getPoint(t, optionalTarget = new Vector2()) {
    const point = optionalTarget;
    if (t === 1) {
      point.copy(this.v2);
    } else {
      point.copy(this.v2).sub(this.v1).multiplyScalar(t).add(this.v1);
    }
    return point;
  }
  getPointAt(u, optionalTarget) {
    return this.getPoint(u, optionalTarget);
  }
  getTangent(t, optionalTarget = new Vector2()) {
    return optionalTarget.subVectors(this.v2, this.v1).normalize();
  }
  getTangentAt(u, optionalTarget) {
    return this.getTangent(u, optionalTarget);
  }
}
LineCurve.prototype.isLineCurve = true;
export class LineCurve3 extends Curve {
  constructor(v1 = new Vector3(), v2 = new Vector3()) {
    super();
    this.type = `LineCurve3`;
    this.v1 = v1;
    this.v2 = v2;
  }
  getPoint(t, optionalTarget = new Vector3()) {
    const point = optionalTarget;
    if (t === 1) {
      point.copy(this.v2);
    } else {
      point.copy(this.v2).sub(this.v1).multiplyScalar(t).add(this.v1);
    }
    return point;
  }
  getPointAt(u, optionalTarget) {
    return this.getPoint(u, optionalTarget);
  }
  getTangent(t, optionalTarget = new Vector3()) {
    return optionalTarget.subVectors(this.v2, this.v1).normalize();
  }
  getTangentAt(u, optionalTarget) {
    return this.getTangent(u, optionalTarget);
  }
}
function CubicBezierP0(t, p) {
  const k = 1 - t;
  return k * k * k * p;
}
function CubicBezierP1(t, p) {
  const k = 1 - t;
  return 3 * k * k * t * p;
}
function CubicBezierP2(t, p) {
  return 3 * (1 - t) * t * t * p;
}
function CubicBezierP3(t, p) {
  return t * t * t * p;
}
function CubicBezier(t, p0, p1, p2, p3) {
  return CubicBezierP0(t, p0) + CubicBezierP1(t, p1) + CubicBezierP2(t, p2) + CubicBezierP3(t, p3);
}
function QuadraticBezier(t, p0, p1, p2) {
  const k = 1 - t;
  return k * k * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
}
export class CubicBezierCurve extends Curve {
  constructor(v0 = new Vector2(), v1 = new Vector2(), v2 = new Vector2(), v3 = new Vector2()) {
    super();
    this.type = `CubicBezierCurve`;
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
    this.v3 = v3;
  }
  getPoint(t, optionalTarget = new Vector2()) {
    const { v0, v1, v2, v3 } = this;
    return optionalTarget.set(
      CubicBezier(t, v0.x, v1.x, v2.x, v3.x),
      CubicBezier(t, v0.y, v1.y, v2.y, v3.y),
    );
  }
}
export class CubicBezierCurve3 extends Curve {
  constructor(v0 = new Vector3(), v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3()) {
    super();
    this.type = `CubicBezierCurve3`;
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
    this.v3 = v3;
  }
  getPoint(t, optionalTarget = new Vector3()) {
    const { v0, v1, v2, v3 } = this;
    return optionalTarget.set(
      CubicBezier(t, v0.x, v1.x, v2.x, v3.x),
      CubicBezier(t, v0.y, v1.y, v2.y, v3.y),
      CubicBezier(t, v0.z, v1.z, v2.z, v3.z),
    );
  }
}
export class QuadraticBezierCurve extends Curve {
  constructor(v0 = new Vector2(), v1 = new Vector2(), v2 = new Vector2()) {
    super();
    this.type = `QuadraticBezierCurve`;
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
  }
  getPoint(t, optionalTarget = new Vector2()) {
    const { v0, v1, v2 } = this;
    return optionalTarget.set(
      QuadraticBezier(t, v0.x, v1.x, v2.x),
      QuadraticBezier(t, v0.y, v1.y, v2.y),
    );
  }
}
export class QuadraticBezierCurve3 extends Curve {
  constructor(v0 = new Vector3(), v1 = new Vector3(), v2 = new Vector3()) {
    super();
    this.type = `QuadraticBezierCurve3`;
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
  }
  getPoint(t, optionalTarget = new Vector3()) {
    const { v0, v1, v2 } = this;
    return optionalTarget.set(
      QuadraticBezier(t, v0.x, v1.x, v2.x),
      QuadraticBezier(t, v0.y, v1.y, v2.y),
      QuadraticBezier(t, v0.z, v1.z, v2.z),
    );
  }
}
function CubicPoly() {
  let c0 = 0,
    c1 = 0,
    c2 = 0,
    c3 = 0;
  function init(x0, x1, t0, t1) {
    c0 = x0;
    c1 = t0;
    c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1;
    c3 = 2 * x0 - 2 * x1 + t0 + t1;
  }
  return {
    initCatmullRom(x0, x1, x2, x3, tension) {
      init(x1, x2, tension * (x2 - x0), tension * (x3 - x1));
    },
    initNonuniformCatmullRom(x0, x1, x2, x3, dt0, dt1, dt2) {
      let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
      let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
      t1 *= dt1;
      t2 *= dt1;
      init(x1, x2, t1, t2);
    },
    calc(t) {
      const t2 = t * t;
      const t3 = t2 * t;
      return c0 + c1 * t + c2 * t2 + c3 * t3;
    },
  };
}
const _tmp = new Vector3();
const _px = CubicPoly();
const _py = CubicPoly();
const _pz = CubicPoly();
export class CatmullRomCurve3 extends Curve {
  constructor(points = [], closed = false, curveType = `centripetal`, tension = 0.5) {
    super();
    this.type = `CatmullRomCurve3`;
    this.points = points;
    this.closed = closed;
    this.curveType = curveType;
    this.tension = tension;
  }
  getPoint(t, optionalTarget = new Vector3()) {
    const point = optionalTarget;
    const points = this.points;
    const l = points.length;
    const p = (l - (this.closed ? 0 : 1)) * t;
    let intPoint = Math.floor(p);
    let weight = p - intPoint;
    if (this.closed) {
      intPoint += intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l;
    } else if (weight === 0 && intPoint === l - 1) {
      intPoint = l - 2;
      weight = 1;
    }
    let p0, p3;
    if (this.closed || intPoint > 0) {
      p0 = points[(intPoint - 1) % l];
    } else {
      _tmp.subVectors(points[0], points[1]).add(points[0]);
      p0 = _tmp;
    }
    const p1 = points[intPoint % l];
    const p2 = points[(intPoint + 1) % l];
    if (this.closed || intPoint + 2 < l) {
      p3 = points[(intPoint + 2) % l];
    } else {
      _tmp.subVectors(points[l - 1], points[l - 2]).add(points[l - 1]);
      p3 = _tmp;
    }
    if (this.curveType === `centripetal` || this.curveType === `chordal`) {
      const pow = this.curveType === `chordal` ? 0.5 : 0.25;
      let dt0 = Math.pow(p0.distanceToSquared(p1), pow);
      let dt1 = Math.pow(p1.distanceToSquared(p2), pow);
      let dt2 = Math.pow(p2.distanceToSquared(p3), pow);
      if (dt1 < 1e-4) {
        dt1 = 1;
      }
      if (dt0 < 1e-4) {
        dt0 = dt1;
      }
      if (dt2 < 1e-4) {
        dt2 = dt1;
      }
      _px.initNonuniformCatmullRom(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2);
      _py.initNonuniformCatmullRom(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2);
      _pz.initNonuniformCatmullRom(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2);
    } else if (this.curveType === `catmullrom`) {
      _px.initCatmullRom(p0.x, p1.x, p2.x, p3.x, this.tension);
      _py.initCatmullRom(p0.y, p1.y, p2.y, p3.y, this.tension);
      _pz.initCatmullRom(p0.z, p1.z, p2.z, p3.z, this.tension);
    }
    point.set(_px.calc(weight), _py.calc(weight), _pz.calc(weight));
    return point;
  }
}
export class SplineCurve extends Curve {
  constructor(points = []) {
    super();
    this.type = `SplineCurve`;
    this.points = points;
  }
  getPoint(t, optionalTarget = new Vector2()) {
    const point = optionalTarget;
    const points = this.points;
    const p = (points.length - 1) * t;
    const intPoint = Math.floor(p);
    const weight = p - intPoint;
    const p0 = points[intPoint === 0 ? intPoint : intPoint - 1];
    const p1 = points[intPoint];
    const p2 = points[intPoint > points.length - 2 ? points.length - 1 : intPoint + 1];
    const p3 = points[intPoint > points.length - 3 ? points.length - 1 : intPoint + 2];
    const catmull = (tt, a, b, c, d) => {
      const v0 = (c - a) * 0.5;
      const v1 = (d - b) * 0.5;
      const t2 = tt * tt;
      const t3 = tt * t2;
      return (2 * b - 2 * c + v0 + v1) * t3 + (-3 * b + 3 * c - 2 * v0 - v1) * t2 + v0 * tt + b;
    };
    return point.set(
      catmull(weight, p0.x, p1.x, p2.x, p3.x),
      catmull(weight, p0.y, p1.y, p2.y, p3.y),
    );
  }
}
export class CurvePath extends Curve {
  constructor() {
    super();
    this.type = `CurvePath`;
    this.curves = [];
    this.autoClose = false;
    this.cacheLengths = null;
  }
  add(curve) {
    this.curves.push(curve);
  }
  closePath() {
    const startPoint = this.curves[0].getPoint(0);
    const endPoint = this.curves[this.curves.length - 1].getPoint(1);
    if (!startPoint.equals(endPoint)) {
      const Line = startPoint.isVector2 === true ? LineCurve : LineCurve3;
      this.curves.push(new Line(endPoint, startPoint));
    }
    return this;
  }
  getPoint(t, optionalTarget) {
    const d = t * this.getLength();
    const curveLengths = this.getCurveLengths();
    let i = 0;
    while (i < curveLengths.length) {
      if (curveLengths[i] >= d) {
        const diff = curveLengths[i] - d;
        const curve = this.curves[i];
        const segmentLength = curve.getLength();
        const u = segmentLength === 0 ? 0 : 1 - diff / segmentLength;
        return curve.getPointAt(u, optionalTarget);
      }
      i++;
    }
    return null;
  }
  getLength() {
    const lens = this.getCurveLengths();
    return lens[lens.length - 1];
  }
  updateArcLengths() {
    this.needsUpdate = true;
    this.cacheLengths = null;
    this.getCurveLengths();
  }
  getCurveLengths() {
    if (this.cacheLengths && this.cacheLengths.length === this.curves.length) {
      return this.cacheLengths;
    }
    const lengths = [];
    let sums = 0;
    for (let i = 0, l = this.curves.length; i < l; i++) {
      sums += this.curves[i].getLength();
      lengths.push(sums);
    }
    this.cacheLengths = lengths;
    return lengths;
  }
  getSpacedPoints(divisions = 40) {
    const points = [];
    for (let i = 0; i <= divisions; i++) {
      points.push(this.getPoint(i / divisions));
    }
    if (this.autoClose) {
      points.push(points[0]);
    }
    return points;
  }
  getPoints(divisions = 12) {
    const points = [];
    let last;
    for (let i = 0, curves = this.curves; i < curves.length; i++) {
      const curve = curves[i];
      const resolution = curve.isEllipseCurve
        ? divisions * 2
        : curve.isLineCurve || curve.type === `LineCurve3`
          ? 1
          : curve.type === `SplineCurve`
            ? divisions * curve.points.length
            : divisions;
      const pts = curve.getPoints(resolution);
      for (let j = 0; j < pts.length; j++) {
        const point = pts[j];
        if (last && last.equals(point)) {
          continue;
        }
        points.push(point);
        last = point;
      }
    }
    if (this.autoClose && points.length > 1 && !points[points.length - 1].equals(points[0])) {
      points.push(points[0]);
    }
    return points;
  }
}
export class Path extends CurvePath {
  constructor(points) {
    super();
    this.type = `Path`;
    this.currentPoint = new Vector2();
    if (points) {
      this.setFromPoints(points);
    }
  }
  setFromPoints(points) {
    this.moveTo(points[0].x, points[0].y);
    for (let i = 1, l = points.length; i < l; i++) {
      this.lineTo(points[i].x, points[i].y);
    }
    return this;
  }
  moveTo(x, y) {
    this.currentPoint.set(x, y);
    return this;
  }
  lineTo(x, y) {
    const curve = new LineCurve(this.currentPoint.clone(), new Vector2(x, y));
    this.curves.push(curve);
    this.currentPoint.set(x, y);
    return this;
  }
  quadraticCurveTo(aCPx, aCPy, aX, aY) {
    const curve = new QuadraticBezierCurve(
      this.currentPoint.clone(),
      new Vector2(aCPx, aCPy),
      new Vector2(aX, aY),
    );
    this.curves.push(curve);
    this.currentPoint.set(aX, aY);
    return this;
  }
  bezierCurveTo(aCP1x, aCP1y, aCP2x, aCP2y, aX, aY) {
    const curve = new CubicBezierCurve(
      this.currentPoint.clone(),
      new Vector2(aCP1x, aCP1y),
      new Vector2(aCP2x, aCP2y),
      new Vector2(aX, aY),
    );
    this.curves.push(curve);
    this.currentPoint.set(aX, aY);
    return this;
  }
  splineThru(pts) {
    const npts = [this.currentPoint.clone()].concat(pts);
    this.curves.push(new SplineCurve(npts));
    this.currentPoint.copy(pts[pts.length - 1]);
    return this;
  }
  arc(aX, aY, aRadius, aStartAngle, aEndAngle, aClockwise) {
    const x0 = this.currentPoint.x;
    const y0 = this.currentPoint.y;
    this.absarc(aX + x0, aY + y0, aRadius, aStartAngle, aEndAngle, aClockwise);
    return this;
  }
  absarc(aX, aY, aRadius, aStartAngle, aEndAngle, aClockwise) {
    this.absellipse(aX, aY, aRadius, aRadius, aStartAngle, aEndAngle, aClockwise);
    return this;
  }
  ellipse(aX, aY, xRadius, yRadius, aStartAngle, aEndAngle, aClockwise, aRotation) {
    const x0 = this.currentPoint.x;
    const y0 = this.currentPoint.y;
    this.absellipse(
      aX + x0,
      aY + y0,
      xRadius,
      yRadius,
      aStartAngle,
      aEndAngle,
      aClockwise,
      aRotation,
    );
    return this;
  }
  absellipse(aX, aY, xRadius, yRadius, aStartAngle, aEndAngle, aClockwise, aRotation) {
    const curve = new EllipseCurve(
      aX,
      aY,
      xRadius,
      yRadius,
      aStartAngle,
      aEndAngle,
      aClockwise,
      aRotation,
    );
    if (this.curves.length > 0) {
      const firstPoint = curve.getPoint(0);
      if (!firstPoint.equals(this.currentPoint)) {
        this.lineTo(firstPoint.x, firstPoint.y);
      }
    }
    this.curves.push(curve);
    const lastPoint = curve.getPoint(1);
    this.currentPoint.copy(lastPoint);
    return this;
  }
}
export class Shape extends Path {
  constructor(points) {
    super(points);
    this.type = `Shape`;
    this.holes = [];
  }
  getPointsHoles(divisions) {
    return this.holes.map((hole) => hole.getPoints(divisions));
  }
  extractPoints(divisions) {
    return {
      shape: this.getPoints(divisions),
      holes: this.getPointsHoles(divisions),
    };
  }
}
Shape.prototype.isShape = true;
export const Earcut = {
  triangulate(data, holeIndices, dim = 2) {
    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
    let outerNode = linkedList(data, 0, outerLen, dim, true);
    const triangles = [];
    if (!outerNode || outerNode.next === outerNode.prev) {
      return triangles;
    }
    let minX, minY, invSize;
    if (hasHoles) {
      outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
    }
    if (data.length > 80 * dim) {
      minX = Infinity;
      minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = dim; i < outerLen; i += dim) {
        const x = data[i];
        const y = data[i + 1];
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
      invSize = Math.max(maxX - minX, maxY - minY);
      invSize = invSize !== 0 ? 32767 / invSize : 0;
    }
    earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);
    return triangles;
  },
};
function linkedList(data, start, end, dim, clockwise) {
  let last;
  if (clockwise === signedArea(data, start, end, dim) > 0) {
    for (let i = start; i < end; i += dim) {
      last = insertNode((i / dim) | 0, data[i], data[i + 1], last);
    }
  } else {
    for (let i = end - dim; i >= start; i -= dim) {
      last = insertNode((i / dim) | 0, data[i], data[i + 1], last);
    }
  }
  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}
function filterPoints(start, end) {
  if (!start) {
    return start;
  }
  if (!end) {
    end = start;
  }
  let p = start;
  let again;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) {
        break;
      }
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);
  return end;
}
function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
  if (!ear) {
    return;
  }
  if (!pass && invSize) {
    indexCurve(ear, minX, minY, invSize);
  }
  let stop = ear;
  while (ear.prev !== ear.next) {
    const prev = ear.prev;
    const next = ear.next;
    if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
      triangles.push(prev.i, ear.i, next.i);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (!pass) {
        earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);
      } else if (pass === 1) {
        ear = cureLocalIntersections(filterPoints(ear), triangles);
        earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);
      } else if (pass === 2) {
        splitEarcut(ear, triangles, dim, minX, minY, invSize);
      }
      break;
    }
  }
}
function isEar(ear) {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;
  if (area(a, b, c) >= 0) {
    return false;
  }
  const ax = a.x,
    bx = b.x,
    cx = c.x,
    ay = a.y,
    by = b.y,
    cy = c.y;
  const x0 = Math.min(ax, bx, cx),
    y0 = Math.min(ay, by, cy);
  const x1 = Math.max(ax, bx, cx),
    y1 = Math.max(ay, by, cy);
  let p = c.next;
  while (p !== a) {
    if (
      p.x >= x0 &&
      p.x <= x1 &&
      p.y >= y0 &&
      p.y <= y1 &&
      pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) {
      return false;
    }
    p = p.next;
  }
  return true;
}
function isEarHashed(ear, minX, minY, invSize) {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;
  if (area(a, b, c) >= 0) {
    return false;
  }
  const ax = a.x,
    bx = b.x,
    cx = c.x,
    ay = a.y,
    by = b.y,
    cy = c.y;
  const x0 = Math.min(ax, bx, cx),
    y0 = Math.min(ay, by, cy);
  const x1 = Math.max(ax, bx, cx),
    y1 = Math.max(ay, by, cy);
  const minZ = zOrder(x0, y0, minX, minY, invSize);
  const maxZ = zOrder(x1, y1, minX, minY, invSize);
  let p = ear.prevZ;
  let n = ear.nextZ;
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (
      p.x >= x0 &&
      p.x <= x1 &&
      p.y >= y0 &&
      p.y <= y1 &&
      p !== a &&
      p !== c &&
      pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) {
      return false;
    }
    p = p.prevZ;
    if (
      n.x >= x0 &&
      n.x <= x1 &&
      n.y >= y0 &&
      n.y <= y1 &&
      n !== a &&
      n !== c &&
      pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, n.x, n.y) &&
      area(n.prev, n, n.next) >= 0
    ) {
      return false;
    }
    n = n.nextZ;
  }
  while (p && p.z >= minZ) {
    if (
      p.x >= x0 &&
      p.x <= x1 &&
      p.y >= y0 &&
      p.y <= y1 &&
      p !== a &&
      p !== c &&
      pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) {
      return false;
    }
    p = p.prevZ;
  }
  while (n && n.z <= maxZ) {
    if (
      n.x >= x0 &&
      n.x <= x1 &&
      n.y >= y0 &&
      n.y <= y1 &&
      n !== a &&
      n !== c &&
      pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, n.x, n.y) &&
      area(n.prev, n, n.next) >= 0
    ) {
      return false;
    }
    n = n.nextZ;
  }
  return true;
}
function cureLocalIntersections(start, triangles) {
  let p = start;
  do {
    const a = p.prev;
    const b = p.next.next;
    if (
      !equals(a, b) &&
      intersects(a, p, p.next, b) &&
      locallyInside(a, b) &&
      locallyInside(b, a)
    ) {
      triangles.push(a.i, p.i, b.i);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p);
}
function splitEarcut(start, triangles, dim, minX, minY, invSize) {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c = splitPolygon(a, b);
        a = filterPoints(a, a.next);
        c = filterPoints(c, c.next);
        earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
        earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}
function eliminateHoles(data, holeIndices, outerNode, dim) {
  const queue = [];
  for (let i = 0, len = holeIndices.length; i < len; i++) {
    const start = holeIndices[i] * dim;
    const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
    const list = linkedList(data, start, end, dim, false);
    if (list === list.next) {
      list.steiner = true;
    }
    queue.push(getLeftmost(list));
  }
  queue.sort(compareXYSlope);
  for (let i = 0; i < queue.length; i++) {
    outerNode = eliminateHole(queue[i], outerNode);
  }
  return outerNode;
}
function compareXYSlope(a, b) {
  let result = a.x - b.x;
  if (result === 0) {
    result = a.y - b.y;
    if (result === 0) {
      const aSlope = (a.next.y - a.y) / (a.next.x - a.x);
      const bSlope = (b.next.y - b.y) / (b.next.x - b.x);
      result = aSlope - bSlope;
    }
  }
  return result;
}
function eliminateHole(hole, outerNode) {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) {
    return outerNode;
  }
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next);
}
function findHoleBridge(hole, outerNode) {
  let p = outerNode;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let m;
  if (equals(hole, p)) {
    return p;
  }
  do {
    if (equals(hole, p.next)) {
      return p.next;
    } else if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) {
          return m;
        }
      }
    }
    p = p.next;
  } while (p !== outerNode);
  if (!m) {
    return null;
  }
  const stop = m;
  const mx = m.x;
  const my = m.y;
  let tanMin = Infinity;
  p = m;
  do {
    if (
      hx >= p.x &&
      p.x >= mx &&
      hx !== p.x &&
      pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)
    ) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (
        locallyInside(p, hole) &&
        (tan < tanMin ||
          (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))
      ) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}
function sectorContainsSector(m, p) {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}
function indexCurve(start, minX, minY, invSize) {
  let p = start;
  do {
    if (p.z === 0) {
      p.z = zOrder(p.x, p.y, minX, minY, invSize);
    }
    p.prevZ = p.prev;
    p.nextZ = p.next;
    p = p.next;
  } while (p !== start);
  p.prevZ.nextZ = null;
  p.prevZ = null;
  sortLinked(p);
}
function sortLinked(list) {
  let numMerges;
  let inSize = 1;
  do {
    let p = list;
    let e;
    list = null;
    let tail = null;
    numMerges = 0;
    while (p) {
      numMerges++;
      let q = p;
      let pSize = 0;
      for (let i = 0; i < inSize; i++) {
        pSize++;
        q = q.nextZ;
        if (!q) {
          break;
        }
      }
      let qSize = inSize;
      while (pSize > 0 || (qSize > 0 && q)) {
        if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
          e = p;
          p = p.nextZ;
          pSize--;
        } else {
          e = q;
          q = q.nextZ;
          qSize--;
        }
        if (tail) {
          tail.nextZ = e;
        } else {
          list = e;
        }
        e.prevZ = tail;
        tail = e;
      }
      p = q;
    }
    tail.nextZ = null;
    inSize *= 2;
  } while (numMerges > 1);
  return list;
}
function zOrder(x, y, minX, minY, invSize) {
  x = ((x - minX) * invSize) | 0;
  y = ((y - minY) * invSize) | 0;
  x = (x | (x << 8)) & 16711935;
  x = (x | (x << 4)) & 252645135;
  x = (x | (x << 2)) & 858993459;
  x = (x | (x << 1)) & 1431655765;
  y = (y | (y << 8)) & 16711935;
  y = (y | (y << 4)) & 252645135;
  y = (y | (y << 2)) & 858993459;
  y = (y | (y << 1)) & 1431655765;
  return x | (y << 1);
}
function getLeftmost(start) {
  let p = start;
  let leftmost = start;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) {
      leftmost = p;
    }
    p = p.next;
  } while (p !== start);
  return leftmost;
}
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
  return (
    (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
    (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
    (bx - px) * (cy - py) >= (cx - px) * (by - py)
  );
}
function pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, px, py) {
  return !(ax === px && ay === py) && pointInTriangle(ax, ay, bx, by, cx, cy, px, py);
}
function isValidDiagonal(a, b) {
  return (
    a.next.i !== b.i &&
    a.prev.i !== b.i &&
    !intersectsPolygon(a, b) &&
    ((locallyInside(a, b) &&
      locallyInside(b, a) &&
      middleInside(a, b) &&
      (area(a.prev, a, b.prev) || area(a, b.prev, b))) ||
      (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0))
  );
}
function area(p, q, r) {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}
function equals(p1, p2) {
  return p1.x === p2.x && p1.y === p2.y;
}
function intersects(p1, q1, p2, q2) {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }
  if (o1 === 0 && onSegment(p1, p2, q1)) {
    return true;
  }
  if (o2 === 0 && onSegment(p1, q2, q1)) {
    return true;
  }
  if (o3 === 0 && onSegment(p2, p1, q2)) {
    return true;
  }
  if (o4 === 0 && onSegment(p2, q1, q2)) {
    return true;
  }
  return false;
}
function onSegment(p, q, r) {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  );
}
function sign(num) {
  return num > 0 ? 1 : num < 0 ? -1 : 0;
}
function intersectsPolygon(a, b) {
  let p = a;
  do {
    if (
      p.i !== a.i &&
      p.next.i !== a.i &&
      p.i !== b.i &&
      p.next.i !== b.i &&
      intersects(p, p.next, a, b)
    ) {
      return true;
    }
    p = p.next;
  } while (p !== a);
  return false;
}
function locallyInside(a, b) {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}
function middleInside(a, b) {
  let p = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    if (
      p.y > py !== p.next.y > py &&
      p.next.y !== p.y &&
      px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x
    ) {
      inside = !inside;
    }
    p = p.next;
  } while (p !== a);
  return inside;
}
function splitPolygon(a, b) {
  const a2 = createNode(a.i, a.x, a.y);
  const b2 = createNode(b.i, b.x, b.y);
  const an = a.next;
  const bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}
function insertNode(i, x, y, last) {
  const p = createNode(i, x, y);
  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}
function removeNode(p) {
  p.next.prev = p.prev;
  p.prev.next = p.next;
  if (p.prevZ) {
    p.prevZ.nextZ = p.nextZ;
  }
  if (p.nextZ) {
    p.nextZ.prevZ = p.prevZ;
  }
}
function createNode(i, x, y) {
  return {
    i,
    x,
    y,
    prev: null,
    next: null,
    z: 0,
    prevZ: null,
    nextZ: null,
    steiner: false,
  };
}
function signedArea(data, start, end, dim) {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}
export const ShapeUtils = {
  area(contour) {
    const n = contour.length;
    let a = 0;
    for (let p = n - 1, q = 0; q < n; p = q++) {
      a += contour[p].x * contour[q].y - contour[q].x * contour[p].y;
    }
    return a * 0.5;
  },
  isClockWise(pts) {
    return ShapeUtils.area(pts) < 0;
  },
  triangulateShape(contour, holes) {
    const vertices = [];
    const holeIndices = [];
    const faces = [];
    removeDupEndPts(contour);
    addContour(vertices, contour);
    let holeIndex = contour.length;
    holes.forEach(removeDupEndPts);
    for (let i = 0; i < holes.length; i++) {
      holeIndices.push(holeIndex);
      holeIndex += holes[i].length;
      addContour(vertices, holes[i]);
    }
    const triangles = Earcut.triangulate(vertices, holeIndices);
    for (let i = 0; i < triangles.length; i += 3) {
      faces.push(triangles.slice(i, i + 3));
    }
    return faces;
  },
};
function removeDupEndPts(points) {
  const l = points.length;
  if (l > 2 && points[l - 1].equals(points[0])) {
    points.pop();
  }
}
function addContour(vertices, contour) {
  for (let i = 0; i < contour.length; i++) {
    vertices.push(contour[i].x);
    vertices.push(contour[i].y);
  }
}
export class ShapeGeometry extends BufferGeometry {
  constructor(
    shapes = new Shape([new Vector2(0, 0.5), new Vector2(-0.5, -0.5), new Vector2(0.5, -0.5)]),
    curveSegments = 12,
  ) {
    super();
    this.type = `ShapeGeometry`;
    this.parameters = {
      shapes,
      curveSegments,
    };
    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];
    let groupStart = 0;
    let groupCount = 0;
    const addShape = (shape) => {
      const indexOffset = vertices.length / 3;
      const points = shape.extractPoints(curveSegments);
      let shapeVertices = points.shape;
      const shapeHoles = points.holes;
      if (ShapeUtils.isClockWise(shapeVertices) === false) {
        shapeVertices = shapeVertices.reverse();
      }
      for (let i = 0, l = shapeHoles.length; i < l; i++) {
        const shapeHole = shapeHoles[i];
        if (ShapeUtils.isClockWise(shapeHole) === true) {
          shapeHoles[i] = shapeHole.reverse();
        }
      }
      const faces = ShapeUtils.triangulateShape(shapeVertices, shapeHoles);
      for (let i = 0, l = shapeHoles.length; i < l; i++) {
        shapeVertices = shapeVertices.concat(shapeHoles[i]);
      }
      for (let i = 0, l = shapeVertices.length; i < l; i++) {
        const vertex = shapeVertices[i];
        vertices.push(vertex.x, vertex.y, 0);
        normals.push(0, 0, 1);
        uvs.push(vertex.x, vertex.y);
      }
      for (let i = 0, l = faces.length; i < l; i++) {
        const face = faces[i];
        const a = face[0] + indexOffset;
        const b = face[1] + indexOffset;
        const c = face[2] + indexOffset;
        indices.push(a, b, c);
        groupCount += 3;
      }
    };
    if (Array.isArray(shapes) === false) {
      addShape(shapes);
    } else {
      for (let i = 0; i < shapes.length; i++) {
        addShape(shapes[i]);
        this.addGroup(groupStart, groupCount, i);
        groupStart += groupCount;
        groupCount = 0;
      }
    }
    this.setIndex(indices);
    this.setAttribute(`position`, new Float32BufferAttribute(vertices, 3));
    this.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvs, 2));
  }
}
const WorldUVGenerator = {
  generateTopUV(geometry, vertices, indexA, indexB, indexC) {
    const a_x = vertices[indexA * 3];
    const a_y = vertices[indexA * 3 + 1];
    const b_x = vertices[indexB * 3];
    const b_y = vertices[indexB * 3 + 1];
    const c_x = vertices[indexC * 3];
    const c_y = vertices[indexC * 3 + 1];
    return [new Vector2(a_x, a_y), new Vector2(b_x, b_y), new Vector2(c_x, c_y)];
  },
  generateSideWallUV(geometry, vertices, indexA, indexB, indexC, indexD) {
    const a_x = vertices[indexA * 3];
    const a_y = vertices[indexA * 3 + 1];
    const a_z = vertices[indexA * 3 + 2];
    const b_x = vertices[indexB * 3];
    const b_y = vertices[indexB * 3 + 1];
    const b_z = vertices[indexB * 3 + 2];
    const c_x = vertices[indexC * 3];
    const c_y = vertices[indexC * 3 + 1];
    const c_z = vertices[indexC * 3 + 2];
    const d_x = vertices[indexD * 3];
    const d_y = vertices[indexD * 3 + 1];
    const d_z = vertices[indexD * 3 + 2];
    if (Math.abs(a_y - b_y) < Math.abs(a_x - b_x)) {
      return [
        new Vector2(a_x, 1 - a_z),
        new Vector2(b_x, 1 - b_z),
        new Vector2(c_x, 1 - c_z),
        new Vector2(d_x, 1 - d_z),
      ];
    }
    return [
      new Vector2(a_y, 1 - a_z),
      new Vector2(b_y, 1 - b_z),
      new Vector2(c_y, 1 - c_z),
      new Vector2(d_y, 1 - d_z),
    ];
  },
};
export class ExtrudeGeometry extends BufferGeometry {
  constructor(
    shapes = new Shape([
      new Vector2(0.5, 0.5),
      new Vector2(-0.5, 0.5),
      new Vector2(-0.5, -0.5),
      new Vector2(0.5, -0.5),
    ]),
    options = {},
  ) {
    super();
    this.type = `ExtrudeGeometry`;
    this.parameters = {
      shapes,
      options,
    };
    const scope = this;
    shapes = Array.isArray(shapes) ? shapes : [shapes];
    const verticesArray = [];
    const uvArray = [];
    for (let i = 0, l = shapes.length; i < l; i++) {
      addShape(shapes[i]);
    }
    this.setAttribute(`position`, new Float32BufferAttribute(verticesArray, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvArray, 2));
    this.computeVertexNormals();
    function addShape(shape) {
      const placeholder = [];
      const curveSegments = options.curveSegments !== undefined ? options.curveSegments : 12;
      const steps = options.steps !== undefined ? options.steps : 1;
      const depth = options.depth !== undefined ? options.depth : 1;
      let bevelEnabled = options.bevelEnabled !== undefined ? options.bevelEnabled : true;
      let bevelThickness = options.bevelThickness !== undefined ? options.bevelThickness : 0.2;
      let bevelSize = options.bevelSize !== undefined ? options.bevelSize : bevelThickness - 0.1;
      let bevelOffset = options.bevelOffset !== undefined ? options.bevelOffset : 0;
      let bevelSegments = options.bevelSegments !== undefined ? options.bevelSegments : 3;
      const extrudePath = options.extrudePath;
      const uvgen = options.UVGenerator !== undefined ? options.UVGenerator : WorldUVGenerator;
      let extrudePts;
      let extrudeByPath = false;
      let splineTube, binormal, normal, position2;
      if (extrudePath) {
        extrudePts = extrudePath.getSpacedPoints(steps);
        extrudeByPath = true;
        bevelEnabled = false;
        splineTube = extrudePath.computeFrenetFrames(steps, false);
        binormal = new Vector3();
        normal = new Vector3();
        position2 = new Vector3();
      }
      if (!bevelEnabled) {
        bevelSegments = 0;
        bevelThickness = 0;
        bevelSize = 0;
        bevelOffset = 0;
      }
      const shapePoints = shape.extractPoints(curveSegments);
      let vertices = shapePoints.shape;
      const holes = shapePoints.holes;
      const reverse = !ShapeUtils.isClockWise(vertices);
      if (reverse) {
        vertices = vertices.reverse();
        for (let h = 0, hl = holes.length; h < hl; h++) {
          const ahole = holes[h];
          if (ShapeUtils.isClockWise(ahole)) {
            holes[h] = ahole.reverse();
          }
        }
      }
      function mergeOverlappingPoints(points) {
        const THRESHOLD = 1e-10;
        const THRESHOLD_SQ = THRESHOLD * THRESHOLD;
        let prevPos = points[0];
        for (let i = 1; i <= points.length; i++) {
          const currentIndex = i % points.length;
          const currentPos = points[currentIndex];
          const dx = currentPos.x - prevPos.x;
          const dy = currentPos.y - prevPos.y;
          const distSq = dx * dx + dy * dy;
          const scalingFactorSqrt = Math.max(
            Math.abs(currentPos.x),
            Math.abs(currentPos.y),
            Math.abs(prevPos.x),
            Math.abs(prevPos.y),
          );
          const thresholdSqScaled = THRESHOLD_SQ * scalingFactorSqrt * scalingFactorSqrt;
          if (distSq <= thresholdSqScaled) {
            points.splice(currentIndex, 1);
            i--;
            continue;
          }
          prevPos = currentPos;
        }
      }
      mergeOverlappingPoints(vertices);
      holes.forEach(mergeOverlappingPoints);
      const numHoles = holes.length;
      const contour = vertices;
      for (let h = 0; h < numHoles; h++) {
        vertices = vertices.concat(holes[h]);
      }
      function scalePt2(pt, vec, size) {
        if (!vec) {
          throw new Error(`ExtrudeGeometry: vec does not exist`);
        }
        return pt.clone().addScaledVector(vec, size);
      }
      const vlen = vertices.length;
      function getBevelVec(inPt, inPrev, inNext) {
        let v_trans_x, v_trans_y, shrink_by;
        const v_prev_x = inPt.x - inPrev.x;
        const v_prev_y = inPt.y - inPrev.y;
        const v_next_x = inNext.x - inPt.x;
        const v_next_y = inNext.y - inPt.y;
        const v_prev_lensq = v_prev_x * v_prev_x + v_prev_y * v_prev_y;
        const collinear0 = v_prev_x * v_next_y - v_prev_y * v_next_x;
        if (Math.abs(collinear0) > Number.EPSILON) {
          const v_prev_len = Math.sqrt(v_prev_lensq);
          const v_next_len = Math.sqrt(v_next_x * v_next_x + v_next_y * v_next_y);
          const ptPrevShift_x = inPrev.x - v_prev_y / v_prev_len;
          const ptPrevShift_y = inPrev.y + v_prev_x / v_prev_len;
          const ptNextShift_x = inNext.x - v_next_y / v_next_len;
          const ptNextShift_y = inNext.y + v_next_x / v_next_len;
          const sf =
            ((ptNextShift_x - ptPrevShift_x) * v_next_y -
              (ptNextShift_y - ptPrevShift_y) * v_next_x) /
            (v_prev_x * v_next_y - v_prev_y * v_next_x);
          v_trans_x = ptPrevShift_x + v_prev_x * sf - inPt.x;
          v_trans_y = ptPrevShift_y + v_prev_y * sf - inPt.y;
          const v_trans_lensq = v_trans_x * v_trans_x + v_trans_y * v_trans_y;
          if (v_trans_lensq <= 2) {
            return new Vector2(v_trans_x, v_trans_y);
          }
          shrink_by = Math.sqrt(v_trans_lensq / 2);
        } else {
          let direction_eq = false;
          if (v_prev_x > Number.EPSILON) {
            if (v_next_x > Number.EPSILON) {
              direction_eq = true;
            }
          } else if (v_prev_x < -Number.EPSILON) {
            if (v_next_x < -Number.EPSILON) {
              direction_eq = true;
            }
          } else if (Math.sign(v_prev_y) === Math.sign(v_next_y)) {
            direction_eq = true;
          }
          if (direction_eq) {
            v_trans_x = -v_prev_y;
            v_trans_y = v_prev_x;
            shrink_by = Math.sqrt(v_prev_lensq);
          } else {
            v_trans_x = v_prev_x;
            v_trans_y = v_prev_y;
            shrink_by = Math.sqrt(v_prev_lensq / 2);
          }
        }
        return new Vector2(v_trans_x / shrink_by, v_trans_y / shrink_by);
      }
      const contourMovements = [];
      for (let i = 0, il = contour.length, j = il - 1, k = i + 1; i < il; i++, j++, k++) {
        if (j === il) {
          j = 0;
        }
        if (k === il) {
          k = 0;
        }
        contourMovements[i] = getBevelVec(contour[i], contour[j], contour[k]);
      }
      const holesMovements = [];
      let oneHoleMovements;
      let verticesMovements = contourMovements.concat();
      for (let h = 0, hl = numHoles; h < hl; h++) {
        const ahole = holes[h];
        oneHoleMovements = [];
        for (let i = 0, il = ahole.length, j = il - 1, k = i + 1; i < il; i++, j++, k++) {
          if (j === il) {
            j = 0;
          }
          if (k === il) {
            k = 0;
          }
          oneHoleMovements[i] = getBevelVec(ahole[i], ahole[j], ahole[k]);
        }
        holesMovements.push(oneHoleMovements);
        verticesMovements = verticesMovements.concat(oneHoleMovements);
      }
      let faces;
      if (bevelSegments === 0) {
        faces = ShapeUtils.triangulateShape(contour, holes);
      } else {
        const contractedContourVertices = [];
        const expandedHoleVertices = [];
        for (let b = 0; b < bevelSegments; b++) {
          const t = b / bevelSegments;
          const z = bevelThickness * Math.cos((t * Math.PI) / 2);
          const bs = bevelSize * Math.sin((t * Math.PI) / 2) + bevelOffset;
          for (let i = 0, il = contour.length; i < il; i++) {
            const vert = scalePt2(contour[i], contourMovements[i], bs);
            v(vert.x, vert.y, -z);
            if (t === 0) {
              contractedContourVertices.push(vert);
            }
          }
          for (let h = 0, hl = numHoles; h < hl; h++) {
            const ahole = holes[h];
            oneHoleMovements = holesMovements[h];
            const oneHoleVertices = [];
            for (let i = 0, il = ahole.length; i < il; i++) {
              const vert = scalePt2(ahole[i], oneHoleMovements[i], bs);
              v(vert.x, vert.y, -z);
              if (t === 0) {
                oneHoleVertices.push(vert);
              }
            }
            if (t === 0) {
              expandedHoleVertices.push(oneHoleVertices);
            }
          }
        }
        faces = ShapeUtils.triangulateShape(contractedContourVertices, expandedHoleVertices);
      }
      const flen = faces.length;
      const bs = bevelSize + bevelOffset;
      for (let i = 0; i < vlen; i++) {
        const vert = bevelEnabled ? scalePt2(vertices[i], verticesMovements[i], bs) : vertices[i];
        if (!extrudeByPath) {
          v(vert.x, vert.y, 0);
        } else {
          normal.copy(splineTube.normals[0]).multiplyScalar(vert.x);
          binormal.copy(splineTube.binormals[0]).multiplyScalar(vert.y);
          position2.copy(extrudePts[0]).add(normal).add(binormal);
          v(position2.x, position2.y, position2.z);
        }
      }
      for (let s = 1; s <= steps; s++) {
        for (let i = 0; i < vlen; i++) {
          const vert = bevelEnabled ? scalePt2(vertices[i], verticesMovements[i], bs) : vertices[i];
          if (!extrudeByPath) {
            v(vert.x, vert.y, (depth / steps) * s);
          } else {
            normal.copy(splineTube.normals[s]).multiplyScalar(vert.x);
            binormal.copy(splineTube.binormals[s]).multiplyScalar(vert.y);
            position2.copy(extrudePts[s]).add(normal).add(binormal);
            v(position2.x, position2.y, position2.z);
          }
        }
      }
      for (let b = bevelSegments - 1; b >= 0; b--) {
        const t = b / bevelSegments;
        const z = bevelThickness * Math.cos((t * Math.PI) / 2);
        const bs2 = bevelSize * Math.sin((t * Math.PI) / 2) + bevelOffset;
        for (let i = 0, il = contour.length; i < il; i++) {
          const vert = scalePt2(contour[i], contourMovements[i], bs2);
          v(vert.x, vert.y, depth + z);
        }
        for (let h = 0, hl = holes.length; h < hl; h++) {
          const ahole = holes[h];
          oneHoleMovements = holesMovements[h];
          for (let i = 0, il = ahole.length; i < il; i++) {
            const vert = scalePt2(ahole[i], oneHoleMovements[i], bs2);
            if (!extrudeByPath) {
              v(vert.x, vert.y, depth + z);
            } else {
              v(vert.x, vert.y + extrudePts[steps - 1].y, extrudePts[steps - 1].x + z);
            }
          }
        }
      }
      buildLidFaces();
      buildSideFaces();
      function buildLidFaces() {
        const start = verticesArray.length / 3;
        if (bevelEnabled) {
          let layer = 0;
          let offset = vlen * layer;
          for (let i = 0; i < flen; i++) {
            const face = faces[i];
            f3(face[2] + offset, face[1] + offset, face[0] + offset);
          }
          layer = steps + bevelSegments * 2;
          offset = vlen * layer;
          for (let i = 0; i < flen; i++) {
            const face = faces[i];
            f3(face[0] + offset, face[1] + offset, face[2] + offset);
          }
        } else {
          for (let i = 0; i < flen; i++) {
            const face = faces[i];
            f3(face[2], face[1], face[0]);
          }
          for (let i = 0; i < flen; i++) {
            const face = faces[i];
            f3(face[0] + vlen * steps, face[1] + vlen * steps, face[2] + vlen * steps);
          }
        }
        scope.addGroup(start, verticesArray.length / 3 - start, 0);
      }
      function buildSideFaces() {
        const start = verticesArray.length / 3;
        let layeroffset = 0;
        sidewalls(contour, layeroffset);
        layeroffset += contour.length;
        for (let h = 0, hl = holes.length; h < hl; h++) {
          const ahole = holes[h];
          sidewalls(ahole, layeroffset);
          layeroffset += ahole.length;
        }
        scope.addGroup(start, verticesArray.length / 3 - start, 1);
      }
      function sidewalls(contour2, layeroffset) {
        let i = contour2.length;
        while (--i >= 0) {
          const j = i;
          let k = i - 1;
          if (k < 0) {
            k = contour2.length - 1;
          }
          for (let s = 0, sl = steps + bevelSegments * 2; s < sl; s++) {
            const slen1 = vlen * s;
            const slen2 = vlen * (s + 1);
            const a = layeroffset + j + slen1;
            const b = layeroffset + k + slen1;
            const c = layeroffset + k + slen2;
            const d = layeroffset + j + slen2;
            f4(a, b, c, d);
          }
        }
      }
      function v(x, y, z) {
        placeholder.push(x);
        placeholder.push(y);
        placeholder.push(z);
      }
      function f3(a, b, c) {
        addVertex(a);
        addVertex(b);
        addVertex(c);
        const nextIndex = verticesArray.length / 3;
        const uvs = uvgen.generateTopUV(
          scope,
          verticesArray,
          nextIndex - 3,
          nextIndex - 2,
          nextIndex - 1,
        );
        addUV(uvs[0]);
        addUV(uvs[1]);
        addUV(uvs[2]);
      }
      function f4(a, b, c, d) {
        addVertex(a);
        addVertex(b);
        addVertex(d);
        addVertex(b);
        addVertex(c);
        addVertex(d);
        const nextIndex = verticesArray.length / 3;
        const uvs = uvgen.generateSideWallUV(
          scope,
          verticesArray,
          nextIndex - 6,
          nextIndex - 3,
          nextIndex - 2,
          nextIndex - 1,
        );
        addUV(uvs[0]);
        addUV(uvs[1]);
        addUV(uvs[3]);
        addUV(uvs[1]);
        addUV(uvs[2]);
        addUV(uvs[3]);
      }
      function addVertex(index) {
        verticesArray.push(placeholder[index * 3 + 0]);
        verticesArray.push(placeholder[index * 3 + 1]);
        verticesArray.push(placeholder[index * 3 + 2]);
      }
      function addUV(vector2) {
        uvArray.push(vector2.x);
        uvArray.push(vector2.y);
      }
    }
  }
}
export class LatheGeometry extends BufferGeometry {
  constructor(
    points = [new Vector2(0, -0.5), new Vector2(0.5, 0), new Vector2(0, 0.5)],
    segments = 12,
    phiStart = 0,
    phiLength = Math.PI * 2,
  ) {
    super();
    this.type = `LatheGeometry`;
    this.parameters = {
      points,
      segments,
      phiStart,
      phiLength,
    };
    segments = Math.floor(segments);
    phiLength = MathUtils.clamp(phiLength, 0, Math.PI * 2);
    const indices = [];
    const vertices = [];
    const uvs = [];
    const initNormals = [];
    const normals = [];
    const inverseSegments = 1 / segments;
    const vertex = new Vector3();
    const uv = new Vector2();
    const normal = new Vector3();
    const curNormal = new Vector3();
    const prevNormal = new Vector3();
    let dx = 0;
    let dy = 0;
    for (let j = 0; j <= points.length - 1; j++) {
      switch (j) {
        case 0:
          dx = points[j + 1].x - points[j].x;
          dy = points[j + 1].y - points[j].y;
          normal.x = dy * 1;
          normal.y = -dx;
          normal.z = dy * 0;
          prevNormal.copy(normal);
          normal.normalize();
          initNormals.push(normal.x, normal.y, normal.z);
          break;
        case points.length - 1:
          initNormals.push(prevNormal.x, prevNormal.y, prevNormal.z);
          break;
        default:
          dx = points[j + 1].x - points[j].x;
          dy = points[j + 1].y - points[j].y;
          normal.x = dy * 1;
          normal.y = -dx;
          normal.z = dy * 0;
          curNormal.copy(normal);
          normal.x += prevNormal.x;
          normal.y += prevNormal.y;
          normal.z += prevNormal.z;
          normal.normalize();
          initNormals.push(normal.x, normal.y, normal.z);
          prevNormal.copy(curNormal);
      }
    }
    for (let i = 0; i <= segments; i++) {
      const phi = phiStart + i * inverseSegments * phiLength;
      const sin = Math.sin(phi);
      const cos = Math.cos(phi);
      for (let j = 0; j <= points.length - 1; j++) {
        vertex.x = points[j].x * sin;
        vertex.y = points[j].y;
        vertex.z = points[j].x * cos;
        vertices.push(vertex.x, vertex.y, vertex.z);
        uv.x = i / segments;
        uv.y = j / (points.length - 1);
        uvs.push(uv.x, uv.y);
        const x = initNormals[3 * j + 0] * sin;
        const y = initNormals[3 * j + 1];
        const z = initNormals[3 * j + 0] * cos;
        normals.push(x, y, z);
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < points.length - 1; j++) {
        const base = j + i * points.length;
        const a = base;
        const b = base + points.length;
        const c = base + points.length + 1;
        const d = base + 1;
        indices.push(a, b, d);
        indices.push(c, d, b);
      }
    }
    this.setIndex(indices);
    this.setAttribute(`position`, new Float32BufferAttribute(vertices, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvs, 2));
    this.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
  }
}
export class TubeGeometry extends BufferGeometry {
  constructor(path, tubularSegments = 64, radius = 1, radialSegments = 8, closed = false) {
    super();
    this.type = `TubeGeometry`;
    this.parameters = {
      path,
      tubularSegments,
      radius,
      radialSegments,
      closed,
    };
    const frames = path.computeFrenetFrames(tubularSegments, closed);
    this.tangents = frames.tangents;
    this.normals = frames.normals;
    this.binormals = frames.binormals;
    const vertex = new Vector3();
    const normal = new Vector3();
    const uv = new Vector2();
    let P = new Vector3();
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const generateSegment = (i) => {
      P = path.getPointAt(i / tubularSegments, P);
      const N = frames.normals[i];
      const B = frames.binormals[i];
      for (let j = 0; j <= radialSegments; j++) {
        const v = (j / radialSegments) * Math.PI * 2;
        const sin = Math.sin(v);
        const cos = -Math.cos(v);
        normal.x = cos * N.x + sin * B.x;
        normal.y = cos * N.y + sin * B.y;
        normal.z = cos * N.z + sin * B.z;
        normal.normalize();
        normals.push(normal.x, normal.y, normal.z);
        vertex.x = P.x + radius * normal.x;
        vertex.y = P.y + radius * normal.y;
        vertex.z = P.z + radius * normal.z;
        vertices.push(vertex.x, vertex.y, vertex.z);
      }
    };
    for (let i = 0; i < tubularSegments; i++) {
      generateSegment(i);
    }
    generateSegment(closed === false ? tubularSegments : 0);
    for (let i = 0; i <= tubularSegments; i++) {
      for (let j = 0; j <= radialSegments; j++) {
        uv.x = i / tubularSegments;
        uv.y = j / radialSegments;
        uvs.push(uv.x, uv.y);
      }
    }
    for (let j = 1; j <= tubularSegments; j++) {
      for (let i = 1; i <= radialSegments; i++) {
        const a = (radialSegments + 1) * (j - 1) + (i - 1);
        const b = (radialSegments + 1) * j + (i - 1);
        const c = (radialSegments + 1) * j + i;
        const d = (radialSegments + 1) * (j - 1) + i;
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }
    this.setIndex(indices);
    this.setAttribute(`position`, new Float32BufferAttribute(vertices, 3));
    this.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvs, 2));
  }
}
