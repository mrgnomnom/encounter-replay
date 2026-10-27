// Ported from RuneLite's cache library (net.runelite.cache.util.ScriptVarType, BSD-2-Clause, see LICENSE in src/cache/store).

export class ScriptVarType {
  static readonly INTEGER = new ScriptVarType("INTEGER", 0, "i", "integer");
  static readonly BOOLEAN = new ScriptVarType("BOOLEAN", 1, "1", "boolean");
  static readonly SEQ = new ScriptVarType("SEQ", 6, "A", "seq");
  static readonly COLOUR = new ScriptVarType("COLOUR", 7, "C", "colour");
  static readonly LOC_SHAPE = new ScriptVarType("LOC_SHAPE", 8, "H", "locshape");
  /** Also known as Widget */
  static readonly COMPONENT = new ScriptVarType("COMPONENT", 9, "I", "component");
  static readonly IDKIT = new ScriptVarType("IDKIT", 10, "K", "idkit");
  static readonly MIDI = new ScriptVarType("MIDI", 11, "M", "midi");
  /** Another version of OBJ, but means that on Jagex's side they used the internal name for an item */
  static readonly NAMEDOBJ = new ScriptVarType("NAMEDOBJ", 13, "O", "namedobj");
  static readonly SYNTH = new ScriptVarType("SYNTH", 14, "P", "synth");
  static readonly STAT = new ScriptVarType("STAT", 17, "S", "stat");
  static readonly COORDGRID = new ScriptVarType("COORDGRID", 22, "c", "coordgrid");
  static readonly GRAPHIC = new ScriptVarType("GRAPHIC", 23, "d", "graphic");
  static readonly FONTMETRICS = new ScriptVarType("FONTMETRICS", 25, "f", "fontmetrics");
  static readonly ENUM = new ScriptVarType("ENUM", 26, "g", "enum");
  static readonly JINGLE = new ScriptVarType("JINGLE", 28, "j", "jingle");
  /** Also known as Object */
  static readonly LOC = new ScriptVarType("LOC", 30, "l", "loc");
  static readonly MODEL = new ScriptVarType("MODEL", 31, "m", "model");
  static readonly NPC = new ScriptVarType("NPC", 32, "n", "npc");
  /** Also known as Item */
  static readonly OBJ = new ScriptVarType("OBJ", 33, "o", "obj");
  static readonly STRING = new ScriptVarType("STRING", 36, "s", "string");
  static readonly SPOTANIM = new ScriptVarType("SPOTANIM", 37, "t", "spotanim");
  static readonly INV = new ScriptVarType("INV", 39, "v", "inv");
  static readonly TEXTURE = new ScriptVarType("TEXTURE", 40, "x", "texture");
  static readonly CATEGORY = new ScriptVarType("CATEGORY", 41, "y", "category");
  static readonly CHAR = new ScriptVarType("CHAR", 42, "z", "char");
  static readonly MAPSCENEICON = new ScriptVarType("MAPSCENEICON", 55, "£", "mapsceneicon");
  static readonly MAPELEMENT = new ScriptVarType("MAPELEMENT", 59, "µ", "mapelement");
  static readonly HITMARK = new ScriptVarType("HITMARK", 62, "×", "hitmark");
  static readonly STRUCT = new ScriptVarType("STRUCT", 73, "J", "struct");
  static readonly DBROW = new ScriptVarType("DBROW", 74, "Ð", "dbrow");
  static readonly DBTABLE = new ScriptVarType("DBTABLE", 118, "Ø", "dbtable");
  static readonly VARP = new ScriptVarType("VARP", 209, "7", "varp");

  private static byId?: Map<number, ScriptVarType>;
  private static byKey?: Map<string, ScriptVarType>;

  private constructor(
    /** The Java enum constant's name() */
    private readonly enumName: string,
    private readonly id: number,
    private readonly keyChar: string,
    private readonly fullName: string,
  ) {}

  static values(): ScriptVarType[] {
    return Object.values(ScriptVarType).filter((v): v is ScriptVarType => v instanceof ScriptVarType);
  }

  /** The type with this id, or undefined (Java null) */
  static forId(id: number): ScriptVarType | undefined {
    ScriptVarType.byId ??= new Map(ScriptVarType.values().filter((t) => t.id !== -1).map((t) => [t.id, t]));
    return ScriptVarType.byId.get(id);
  }

  static forCharKey(key: string): ScriptVarType | undefined {
    ScriptVarType.byKey ??= new Map(ScriptVarType.values().map((t) => [t.keyChar, t]));
    return ScriptVarType.byKey.get(key);
  }

  name(): string { return this.enumName; }
  getId(): number { return this.id; }
  getKeyChar(): string { return this.keyChar; }
  getFullName(): string { return this.fullName; }
  toString(): string { return this.enumName; }
}
