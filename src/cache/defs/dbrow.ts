// Ported from RuneLite's cache library (net.runelite.cache.definitions.DBRowDefinition, DBTableDefinition and loaders.DBRowLoader, DBTableLoader, BSD-2-Clause, see LICENSE in src/cache/store).
import { InputStream } from "../store/input";
import { ScriptVarType } from "./scriptVarType";

/** A column value: strings, or ints for every other type */
export type DBValue = string | number;

export class DBTableDefinition {
  /** Per column, its tuple's types (undefined entries for unknown type ids) */
  types?: ((ScriptVarType | undefined)[] | undefined)[];
  defaultColumnValues?: (DBValue[] | undefined)[];

  constructor(private readonly id: number) {}

  getId(): number { return this.id; }
  getTypes(): ((ScriptVarType | undefined)[] | undefined)[] | undefined { return this.types; }
  getDefaultColumnValues(): (DBValue[] | undefined)[] | undefined { return this.defaultColumnValues; }
}

export class DBTableLoader {
  load(id: number, b: Uint8Array): DBTableDefinition {
    const def = new DBTableDefinition(id);
    const is = new InputStream(b);
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      this.decode(opcode, def, is);
    }
    return def;
  }

  private decode(opcode: number, def: DBTableDefinition, stream: InputStream): void {
    if (opcode === 1) {
      const numColumns = stream.readUnsignedByte();
      const types: ((ScriptVarType | undefined)[] | undefined)[] = new Array(numColumns).fill(undefined);
      let defaultValues: (DBValue[] | undefined)[] | undefined;
      for (let setting = stream.readUnsignedByte(); setting !== 255; setting = stream.readUnsignedByte()) {
        const columnId = setting & 0x7f;
        const hasDefault = (setting & 0x80) !== 0;
        const columnTypes: (ScriptVarType | undefined)[] = new Array(stream.readUnsignedByte());
        for (let i = 0; i < columnTypes.length; i++) columnTypes[i] = ScriptVarType.forId(stream.readUnsignedShortSmart());
        setColumn(types, columnId, columnTypes);
        if (hasDefault) {
          if (defaultValues === undefined) defaultValues = new Array(types.length).fill(undefined);
          setColumn(defaultValues, columnId, DBTableLoader.decodeColumnFields(stream, columnTypes));
        }
      }
      def.types = types;
      def.defaultColumnValues = defaultValues;
    } else {
      console.warn(`Unrecognized dbtable opcode ${opcode}`);
    }
  }

  static decodeColumnFields(stream: InputStream, types: (ScriptVarType | undefined)[]): DBValue[] {
    const fieldCount = stream.readUnsignedShortSmart();
    const values: DBValue[] = new Array(fieldCount * types.length);
    for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
      for (let typeIndex = 0; typeIndex < types.length; typeIndex++) {
        const type = types[typeIndex];
        const valuesIndex = fieldIndex * types.length + typeIndex;
        values[valuesIndex] = type === ScriptVarType.STRING ? stream.readString() : stream.readInt();
      }
    }
    return values;
  }
}

/** Java throws storing past an array's end; so does this */
export function setColumn<T>(array: (T | undefined)[], index: number, value: T): void {
  if (index >= array.length) throw new RangeError(`Column ${index} out of bounds for ${array.length} columns`);
  array[index] = value;
}

export class DBRowDefinition {
  tableId = 0;
  /** Per column, its tuple's types (undefined entries for unknown type ids) */
  columnTypes?: ((ScriptVarType | undefined)[] | undefined)[];
  /** Per column, its values: fields x types, flattened; strings for STRING, else ints */
  columnValues?: (DBValue[] | undefined)[];

  constructor(private readonly id: number) {}

  getId(): number { return this.id; }
  getTableId(): number { return this.tableId; }
  getColumnTypes(): ((ScriptVarType | undefined)[] | undefined)[] | undefined { return this.columnTypes; }
  getColumnValues(): (DBValue[] | undefined)[] | undefined { return this.columnValues; }
}

export class DBRowLoader {
  load(id: number, b: Uint8Array): DBRowDefinition {
    const def = new DBRowDefinition(id);
    const is = new InputStream(b);
    for (;;) {
      const opcode = is.readUnsignedByte();
      if (opcode === 0) break;
      this.decode(opcode, def, is);
    }
    return def;
  }

  private decode(opcode: number, def: DBRowDefinition, stream: InputStream): void {
    switch (opcode) {
      case 3: {
        const numColumns = stream.readUnsignedByte();
        const types: ((ScriptVarType | undefined)[] | undefined)[] = new Array(numColumns).fill(undefined);
        const columnValues: (DBValue[] | undefined)[] = new Array(numColumns).fill(undefined);
        for (let columnId = stream.readUnsignedByte(); columnId !== 255; columnId = stream.readUnsignedByte()) {
          const columnTypes: (ScriptVarType | undefined)[] = new Array(stream.readUnsignedByte());
          for (let i = 0; i < columnTypes.length; i++) columnTypes[i] = ScriptVarType.forId(stream.readUnsignedShortSmart());
          setColumn(types, columnId, columnTypes);
          setColumn(columnValues, columnId, DBTableLoader.decodeColumnFields(stream, columnTypes));
        }
        def.columnTypes = types;
        def.columnValues = columnValues;
        break;
      }
      case 4:
        def.tableId = stream.readVarInt2();
        break;
      default:
        console.warn(`Unrecognized dbrow opcode ${opcode}`);
        break;
    }
  }
}
