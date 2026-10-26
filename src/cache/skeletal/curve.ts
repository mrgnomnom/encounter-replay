// Ported from rs-map-viewer by dennisdev (BSD-2-Clause, see LICENSE in this folder): Curve.ts,
// CurveInterp.ts and CurveInterpType.ts. A skeletal animation is a set of these curves, each giving one
// value (a bone's rotation, translation or scale on one axis) for every client cycle of the animation.
// Variable names follow the original, which follows the game client.

import { FLOAT_MAX, type Reader } from "./reader";

const ULP = 1.1920929e-7;
const ULP2 = 2 * ULP;

/** How a curve continues before its first point and after its last */
const enum Interp {
  HOLD = 0,
  LINEAR = 1,
  REPEAT = 2,
  REPEAT_OFFSET = 3,
  PING_PONG = 4,
}

function interpType(id: number): Interp {
  return id < 0 || id > 4 ? Interp.HOLD : id;
}

export class CurvePoint {
  x = 0;
  y = 0;
  field2 = 0;
  field3 = 0;
  field4 = 0;
  field5 = 0;
  next?: CurvePoint;

  decode(buffer: Reader): void {
    this.x = buffer.readShort();
    this.y = buffer.readFloat();
    this.field2 = buffer.readFloat();
    this.field3 = buffer.readFloat();
    this.field4 = buffer.readFloat();
    this.field5 = buffer.readFloat();
  }
}

export class Curve {
  type = 0;
  startInterpType = Interp.HOLD;
  endInterpType = Interp.HOLD;
  bool = false;
  points?: CurvePoint[];
  startTick = 0;
  endTick = 0;
  values = new Float32Array(0);
  minValue = 0;
  maxValue = 0;
  noInterp = false;
  pointIndex = 0;
  pointIndexUpdated = true;
  interpBool = false;
  interpV0 = 0;
  interpV1 = 0;
  interpV2 = 0;
  interpV3 = 0;
  interpV4 = 0;
  interpV5 = 0;
  interpV6 = 0;
  interpV7 = 0;
  interpV8 = 0;
  interpV9 = 0;

  decode(buffer: Reader): void {
    const count = buffer.readUnsignedShort();
    this.type = buffer.readUnsignedByte();
    this.startInterpType = interpType(buffer.readUnsignedByte());
    this.endInterpType = interpType(buffer.readUnsignedByte());
    this.bool = buffer.readUnsignedByte() !== 0;
    this.points = new Array(count);
    let last: CurvePoint | undefined;
    for (let i = 0; i < count; i++) {
      const point = new CurvePoint();
      point.decode(buffer);
      this.points[i] = point;
      if (last) last.next = point;
      last = point;
    }
  }

  /** Samples the curve once per cycle so playback is a table lookup */
  load(): void {
    if (!this.points || this.points.length === 0) return;
    this.startTick = this.points[0].x;
    this.endTick = this.points[this.points.length - 1].x;
    this.values = new Float32Array(this.endTick - this.startTick + 1);
    for (let t = this.startTick; t <= this.endTick; t++) this.values[t - this.startTick] = interpolateCurve(this, t);
    this.points = undefined;
    // As in the original, which matches the client: these come out as 0 because the points are gone
    this.minValue = interpolateCurve(this, this.startTick - 1);
    this.maxValue = interpolateCurve(this, this.endTick + 1);
  }

  getValue(t: number): number {
    if (t < this.startTick) return this.minValue;
    if (t > this.endTick) return this.maxValue;
    return this.values[t - this.startTick];
  }

  getPointIndex(t: number): number {
    const points = this.points;
    if (!points) return this.pointIndex;
    if (
      this.pointIndex < 0 ||
      points[this.pointIndex].x > t ||
      (points[this.pointIndex].next && points[this.pointIndex].next!.x <= t)
    ) {
      if (t < this.startTick || t > this.endTick) return -1;
      let found = this.pointIndex;
      let lo = 0;
      let hi = points.length - 1;
      do {
        const mid = (lo + hi) >> 1;
        if (t < points[mid].x) {
          if (t > points[mid - 1].x) {
            found = mid - 1;
            break;
          }
          hi = mid - 1;
        } else {
          if (t <= points[mid].x || t < points[mid + 1].x) {
            found = mid;
            break;
          }
          lo = mid + 1;
        }
      } while (lo <= hi);
      if (this.pointIndex !== found) {
        this.pointIndex = found;
        this.pointIndexUpdated = true;
      }
    }
    return this.pointIndex;
  }

  getCurvePoint(t: number): CurvePoint | undefined {
    if (!this.points) return undefined;
    const index = this.getPointIndex(t);
    return index < 0 || index >= this.points.length ? undefined : this.points[index];
  }
}

export function interpolateCurve(curve: Curve, t: number): number {
  const points = curve.points;
  if (!points || points.length === 0) return 0;
  if (t < curve.startTick) {
    return curve.startInterpType === Interp.HOLD ? points[0].y : extrapolateCurve(curve, t, true);
  }
  if (t > curve.endTick) {
    return curve.endInterpType === Interp.HOLD ? points[points.length - 1].y : extrapolateCurve(curve, t, false);
  }
  if (curve.noInterp) return points[0].y;
  const point = curve.getCurvePoint(t);
  if (!point) return 0;
  let bool0 = false;
  let bool1 = false;
  if (point.field4 === 0 && point.field5 === 0) {
    bool0 = true;
  } else if (point.field4 === FLOAT_MAX && point.field5 === FLOAT_MAX) {
    bool1 = true;
  } else if (!point.next) {
    bool0 = true;
  } else if (curve.pointIndexUpdated) {
    const var5 = point.x;
    const var9 = point.y;
    const var6 = point.field4 * 0.33333334 + var5;
    const var10 = point.field5 * 0.33333334 + var9;
    const var8 = point.next.x;
    const var12 = point.next.y;
    const var7 = var8 - point.next.field2 * 0.33333334;
    const var11 = var12 - point.next.field3 * 0.33333334;
    if (curve.bool) {
      let var15 = var10;
      let var16 = var11;
      const var17 = var8 - var5;
      if (var17 !== 0) {
        const var18 = var6 - var5;
        const var19 = var7 - var5;
        // Float32 storage, as in the original, so the comparison below rounds the same way
        const var29 = new Float32Array([var18 / var17, var19 / var17]);
        curve.interpBool = var29[0] === Math.fround(0.33333334) && var29[1] === Math.fround(0.6666667);
        const var21 = var29[0];
        const var22 = var29[1];
        if (var29[0] < 0) var29[0] = 0;
        if (var29[1] > 1) var29[1] = 1;
        if (var29[0] > 1 || var29[1] < -1) method3282(var29);
        if (var29[0] !== var21 && var21 !== 0) var15 = ((var10 - var9) * var29[0]) / var21 + var9;
        if (var22 !== var29[1] && var22 !== 1) var16 = var12 - ((1 - var29[1]) * (var12 - var11)) / (1 - var22);
        curve.interpV0 = var5;
        curve.interpV1 = var8;
        const var23 = var29[0];
        const var24 = var29[1];
        let var25 = var23 - 0;
        let var26 = var24 - var23;
        let var27 = 1 - var24;
        let var28 = var26 - var25;
        curve.interpV5 = var27 - var26 - var28;
        curve.interpV4 = var28 + var28 + var28;
        curve.interpV3 = var25 + var25 + var25;
        curve.interpV2 = 0;
        var25 = var15 - var9;
        var26 = var16 - var15;
        var27 = var12 - var16;
        var28 = var26 - var25;
        curve.interpV9 = var27 - var26 - var28;
        curve.interpV8 = var28 + var28 + var28;
        curve.interpV7 = var25 + var25 + var25;
        curve.interpV6 = var9;
      }
    } else {
      curve.interpV0 = var5;
      const var13 = var8 - var5;
      const var14 = var12 - var9;
      let var15 = var6 - var5;
      let var16 = 0;
      let var17 = 0;
      if (var15 !== 0) var16 = (var10 - var9) / var15;
      var15 = var8 - var7;
      if (var15 !== 0) var17 = (var12 - var11) / var15;
      const var18 = 1 / (var13 * var13);
      const var19 = var16 * var13;
      const var20 = var17 * var13;
      curve.interpV2 = (var18 * (var19 + var20 - var14 - var14)) / var13;
      curve.interpV3 = var18 * (var14 + var14 + var14 - var19 - var19 - var20);
      curve.interpV4 = var16;
      curve.interpV5 = var9;
    }
    curve.pointIndexUpdated = false;
  }

  if (bool0) return point.y;
  if (bool1) return point.x !== t && point.next ? point.next.y : point.y;
  if (curve.bool) return method8290(curve, t);
  const var6 = t - curve.interpV0;
  return curve.interpV5 + var6 * ((var6 * curve.interpV2 + curve.interpV3) * var6 + curve.interpV4);
}

function extrapolateCurve(curve: Curve, t: number, isStart: boolean): number {
  const points = curve.points;
  if (!points || points.length === 0) return 0;
  const var4 = points[0].x;
  const var5 = points[points.length - 1].x;
  const var6 = var5 - var4;
  if (var6 === 0) return points[0].y;
  const var7 = t > var5 ? (t - var5) / var6 : (t - var4) / var6;
  let var8 = var7 | 0;
  let var10 = Math.abs(var7 - var8);
  let var11 = var10 * var6;
  var8 = Math.abs(1 + var8);
  const var12 = var8 / 2;
  var10 = var12 - (var12 | 0);
  if (isStart) {
    if (curve.startInterpType === Interp.PING_PONG) {
      var11 = var10 !== 0 ? var11 + var4 : var5 - var11;
    } else if (curve.startInterpType === Interp.REPEAT || curve.startInterpType === Interp.REPEAT_OFFSET) {
      var11 = var5 - var11;
    } else if (curve.startInterpType === Interp.LINEAR) {
      var11 = var4 - t;
      const var16 = points[0].field2;
      const var17 = points[0].field3;
      let output = points[0].y;
      if (var16 !== 0) output -= (var11 * var17) / var16;
      return output;
    }
  } else if (curve.endInterpType === Interp.PING_PONG) {
    var11 = var10 !== 0 ? var5 - var11 : var11 + var4;
  } else if (curve.endInterpType === Interp.REPEAT || curve.endInterpType === Interp.REPEAT_OFFSET) {
    var11 += var4;
  } else if (curve.endInterpType === Interp.LINEAR) {
    var11 = t - var5;
    const last = points[points.length - 1];
    let output = last.y;
    if (last.field4 !== 0) output += (last.field5 * var11) / last.field4;
    return output;
  }
  let output = interpolateCurve(curve, var11);
  const span = points[points.length - 1].y - points[0].y;
  if (isStart && curve.startInterpType === Interp.REPEAT_OFFSET) output -= span * var8;
  else if (!isStart && curve.endInterpType === Interp.REPEAT_OFFSET) output += span * var8;
  return output;
}

function method3282(v: Float32Array): void {
  v[1] = 1 - v[1];
  if (v[0] < 0) v[0] = 0;
  if (v[1] < 0) v[1] = 0;
  if (v[0] > 1 || v[1] > 1) {
    const var1 = 1 + v[0] * (v[0] - 2 + v[1]) + (v[1] - 2) * v[1];
    if (var1 + ULP > 0) {
      if (ULP + v[0] < 1.3333334) {
        const var2 = v[0] - 2;
        const var3 = v[0] - 1;
        const var4 = Math.sqrt(var2 * var2 - 4 * var3 * var3);
        const var5 = 0.5 * (var4 + -var2);
        if (v[1] + ULP > var5) {
          v[1] = var5 - ULP;
        } else {
          const var6 = (-var2 - var4) * 0.5;
          if (v[1] < var6 + ULP) v[1] = var6 + ULP;
        }
      } else {
        v[0] = 1.3333334 - ULP;
        v[1] = 0.33333334 - ULP;
      }
    }
  }
  v[1] = 1 - v[1];
}

const solveInput = new Float32Array(4);
const solveOutput = new Float32Array(5);

function method8290(curve: Curve, t: number): number {
  let v0: number;
  if (curve.interpV0 === t) v0 = 0;
  else if (t === curve.interpV1) v0 = 1;
  else v0 = (t - curve.interpV0) / (curve.interpV1 - curve.interpV0);
  let v1: number;
  if (curve.interpBool) {
    v1 = v0;
  } else {
    solveInput[3] = curve.interpV5;
    solveInput[2] = curve.interpV4;
    solveInput[1] = curve.interpV3;
    solveInput[0] = curve.interpV2 - v0;
    solveOutput.fill(0);
    v1 = method5023(solveInput, 3, 0, true, 1, true, solveOutput) === 1 ? solveOutput[0] : 0;
  }
  return v1 * (curve.interpV7 + v1 * (v1 * curve.interpV9 + curve.interpV8)) + curve.interpV6;
}

function method6869(values: Float32Array, lastIndex: number, x: number): number {
  let output = values[lastIndex];
  for (let i = lastIndex - 1; i >= 0; i--) output = output * x + values[i];
  return output;
}

/** Finds the roots of a polynomial between two bounds, as the client does */
function method5023(var0: Float32Array, var1: number, var2: number, var3: boolean, var4: number, var5: boolean, var6: Float32Array): number {
  let var7 = 0;
  for (let i = 0; i < var1 + 1; i++) var7 += Math.abs(var0[i]);
  const var44 = (Math.abs(var2) + Math.abs(var4)) * (var1 + 1) * ULP;
  if (var7 <= var44) return -1;
  const var9 = new Float32Array(var1 + 1);
  for (let i = 0; i < var1 + 1; i++) var9[i] = (1 / var7) * var0[i];
  while (Math.abs(var9[var1]) < var44) var1--;
  let status = 0;
  if (var1 === 0) return status;
  if (var1 === 1) {
    var6[0] = -var9[0] / var9[1];
    const var42 = var3 ? var2 < var6[0] + var44 : var2 < var6[0] - var44;
    const var43 = var5 ? var4 > var6[0] - var44 : var4 > var6[0] + var44;
    status = var42 && var43 ? 1 : 0;
    if (status > 0) {
      if (var3 && var6[0] < var2) var6[0] = var2;
      else if (var5 && var6[0] > var4) var6[0] = var4;
    }
    return status;
  }
  const field4756 = var9;
  const field4757 = var1;
  const var12 = new Float32Array(var1 + 1);
  for (let i = 1; i <= var1; i++) var12[i - 1] = i * var9[i];
  const var41 = new Float32Array(var1 + 1);
  const recursiveStatus = method5023(var12, var1 - 1, var2, false, var4, false, var41);
  if (recursiveStatus === -1) return 0;
  let var15 = false;
  let var17 = 0;
  let var18 = 0;
  let var19 = 0;
  for (let s = 0; s <= recursiveStatus; s++) {
    if (status > var1) return status;
    let var16: number;
    if (s === 0) {
      var16 = var2;
      var18 = method6869(var9, var1, var2);
      if (Math.abs(var18) <= var44 && var3) var6[status++] = var2;
    } else {
      var16 = var19;
      var18 = var17;
    }
    if (recursiveStatus === s) {
      var19 = var4;
      var15 = false;
    } else {
      var19 = var41[s];
    }
    var17 = method6869(var9, var1, var19);
    if (var15) {
      var15 = false;
    } else if (Math.abs(var17) < var44) {
      if (recursiveStatus !== s || var5) {
        var6[status++] = var19;
        var15 = true;
      }
    } else if ((var18 < 0 && var17 > 0) || (var18 > 0 && var17 < 0)) {
      const var22 = status++;
      let var24 = var16;
      let var25 = var19;
      let var26 = method6869(field4756, field4757, var16);
      let var23: number;
      if (Math.abs(var26) < ULP) {
        var23 = var16;
      } else {
        let var27 = method6869(field4756, field4757, var19);
        if (Math.abs(var27) < ULP) {
          var23 = var19;
        } else {
          let var28 = 0;
          let var29 = 0;
          let var30 = 0;
          let var35 = 0;
          let var36 = true;
          let var37: boolean;
          do {
            var37 = false;
            if (var36) {
              var28 = var24;
              var35 = var26;
              var29 = var25 - var24;
              var30 = var29;
              var36 = false;
            }
            if (Math.abs(var35) < Math.abs(var27)) {
              var24 = var25;
              var25 = var28;
              var28 = var24;
              var26 = var27;
              var27 = var35;
              var35 = var26;
            }
            const var38 = ULP2 * Math.abs(var25) + 0;
            const var39 = 0.5 * (var28 - var25);
            if (Math.abs(var39) > var38 && var27 !== 0) {
              if (Math.abs(var30) < var38 || Math.abs(var26) <= Math.abs(var27)) {
                var29 = var39;
                var30 = var39;
              } else {
                let var34 = var27 / var26;
                let var31: number;
                let var32: number;
                if (var24 === var28) {
                  var31 = var39 * 2 * var34;
                  var32 = 1 - var34;
                } else {
                  var32 = var26 / var35;
                  const var33 = var27 / var35;
                  var31 = var34 * (var39 * 2 * var32 * (var32 - var33) - (var33 - 1) * (var25 - var24));
                  var32 = (var33 - 1) * (var32 - 1) * (var34 - 1);
                }
                if (var31 > 0) var32 = -var32;
                else var31 = -var31;
                var34 = var30;
                var30 = var29;
                if (2 * var31 < 3 * var39 * var32 - Math.abs(var32 * var38) && var31 < Math.abs(var32 * var34 * 0.5)) {
                  var29 = var31 / var32;
                } else {
                  var29 = var39;
                  var30 = var39;
                }
              }
              var24 = var25;
              var26 = var27;
              if (Math.abs(var29) > var38) var25 += var29;
              else if (var39 > 0) var25 += var38;
              else var25 -= var38;
              var27 = method6869(field4756, field4757, var25);
              if (var27 * (var35 / Math.abs(var35)) > 0) var36 = true;
              var37 = true;
            }
          } while (var37);
          var23 = var25;
        }
      }
      var6[var22] = var23;
      if (status > 1 && var6[status - 2] >= var6[status - 1] - var44) {
        var6[status - 2] = 0.5 * (var6[status - 2] + var6[status - 1]);
        status--;
      }
    }
  }
  return status;
}
