// A canonical JSON form of a definition's fields, for checking the port against RuneLite's Java (the
// exporter's DefsProbe makes the same form by reflection): fields sorted by name, unset fields left out,
// longs as "<n>L", enums by name, map keys sorted, and everything outside printable ASCII escaped.
import { ScriptVarType } from "./scriptVarType";

export function canonical(value: unknown): string {
  const out: string[] = [];
  write(value, out);
  return out.join("");
}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function write(v: unknown, out: string[]): void {
  if (v === null || v === undefined) {
    out.push("null");
  } else if (typeof v === "string") {
    out.push(str(v));
  } else if (typeof v === "boolean") {
    out.push(v ? "true" : "false");
  } else if (typeof v === "number") {
    if (!Number.isInteger(v)) throw new Error(`Not an integer: ${v}`);
    out.push(String(v));
  } else if (typeof v === "bigint") {
    out.push(`"${v}L"`);
  } else if (v instanceof ScriptVarType) {
    out.push(str(v.name()));
  } else if (Array.isArray(v) || ArrayBuffer.isView(v)) {
    out.push("[");
    const a = v as ArrayLike<unknown>;
    for (let i = 0; i < a.length; i++) {
      if (i > 0) out.push(",");
      write(a[i], out);
    }
    out.push("]");
  } else if (v instanceof Map) {
    const keys = [...v.keys()];
    if (keys.every((k) => typeof k === "number")) keys.sort((a, b) => a - b);
    else keys.sort((a, b) => order(String(a), String(b)));
    out.push("{");
    keys.forEach((k, i) => {
      if (i > 0) out.push(",");
      out.push(str(String(k)), ":");
      write(v.get(k), out);
    });
    out.push("}");
  } else if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined && o[k] !== null).sort(order);
    out.push("{");
    keys.forEach((k, i) => {
      if (i > 0) out.push(",");
      out.push(str(k), ":");
      write(o[k], out);
    });
    out.push("}");
  } else {
    throw new Error(`Can't write a ${typeof v}`);
  }
}

function str(s: string): string {
  let r = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22 || c === 0x5c) r += "\\" + s[i];
    else if (c < 0x20 || c > 0x7e) r += "\\u" + c.toString(16).padStart(4, "0");
    else r += s[i];
  }
  return r + '"';
}
