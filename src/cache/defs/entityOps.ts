// Ported from RuneLite's cache library (net.runelite.cache.EntityOpsDefinition and definitions.loaders.EntityOpsLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import type { InputStream } from "../store/input";

export class Op {
  constructor(public text: string) {}
}

export class SubOp extends Op {
  constructor(text: string, public subID: number) {
    super(text);
  }
}

export class ConditionalOp extends Op {
  constructor(text: string, public varpID: number, public varbitID: number, public minValue: number, public maxValue: number) {
    super(text);
  }
}

export class ConditionalSubOp extends ConditionalOp {
  constructor(text: string, public subID: number, varpID: number, varbitID: number, minValue: number, maxValue: number) {
    super(text, varpID, varbitID, minValue, maxValue);
  }
}

export class EntityOpsDefinition {
  ops: (Op | undefined)[] = [];
  subOps: SubOp[][] = [];
  conditionalOps: ConditionalOp[][] = [];
  conditionalSubOps: (Map<number, ConditionalSubOp[]> | undefined)[] = [];

  setOp(index: number, text: string): this {
    while (this.ops.length <= index) this.ops.push(undefined);
    this.ops[index] = new Op(text);
    return this;
  }

  setSubOp(index: number, subID: number, text: string): this {
    while (this.subOps.length <= index) this.subOps.push([]);
    this.subOps[index].push(new SubOp(text, subID));
    return this;
  }

  setConditionalOp(index: number, text: string, varpID: number, varbitID: number, minValue: number, maxValue: number): this {
    while (this.conditionalOps.length <= index) this.conditionalOps.push([]);
    this.conditionalOps[index].push(new ConditionalOp(text, varpID, varbitID, minValue, maxValue));
    return this;
  }

  setConditionalSubOp(index: number, subID: number, text: string, varpID: number, varbitID: number, minValue: number, maxValue: number): this {
    while (this.conditionalSubOps.length <= index) this.conditionalSubOps.push(undefined);
    let map = this.conditionalSubOps[index];
    if (!map) this.conditionalSubOps[index] = map = new Map();
    let list = map.get(subID);
    if (!list) map.set(subID, (list = []));
    list.push(new ConditionalSubOp(text, subID, varpID, varbitID, minValue, maxValue));
    return this;
  }

  getOps(): (Op | undefined)[] { return this.ops; }
  getSubOps(): SubOp[][] { return this.subOps; }
  getConditionalOps(): ConditionalOp[][] { return this.conditionalOps; }
  getConditionalSubOps(): (Map<number, ConditionalSubOp[]> | undefined)[] { return this.conditionalSubOps; }
}

export class EntityOpsLoader {
  decodeOp(ops: EntityOpsDefinition, is: InputStream, index: number): void {
    const text = is.readString();
    if (text.toLowerCase() !== "hidden") ops.setOp(index, text);
  }

  decodeSubOp(ops: EntityOpsDefinition, is: InputStream): void {
    const index = is.readUnsignedByte();
    const subID = is.readUnsignedByte();
    const text = is.readString();
    ops.setSubOp(index, subID, text);
  }

  decodeConditionalOp(ops: EntityOpsDefinition, is: InputStream): void {
    const index = is.readUnsignedByte();
    const varp = is.readUnsignedShort();
    const varb = is.readUnsignedShort();
    const min = is.readInt();
    const max = is.readInt();
    const text = is.readString();
    ops.setConditionalOp(index, text, varp, varb, min, max);
  }

  decodeConditionalSubOp(ops: EntityOpsDefinition, is: InputStream): void {
    const index = is.readUnsignedByte();
    const subID = is.readUnsignedShort();
    const varp = is.readUnsignedShort();
    const varb = is.readUnsignedShort();
    const min = is.readInt();
    const max = is.readInt();
    const text = is.readString();
    ops.setConditionalSubOp(index, subID, text, varp, varb, min, max);
  }
}
