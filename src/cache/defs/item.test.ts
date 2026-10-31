import { describe, expect, it } from "vitest";
import { ItemDefinition } from "./item";

function item(id: number, fields: Partial<ItemDefinition>): ItemDefinition {
  return Object.assign(new ItemDefinition(id), fields);
}

describe("linking items", () => {
  const paper = item(799, { name: "null", inventoryModel: 2429, zoom2d: 1000 });
  const staff = item(1391, { name: "Battlestaff", inventoryModel: 2810, cost: 7000 });
  const all = new Map([[799, paper], [1391, staff]]);

  it("gives a noted item the note's model and the real item's name, not model 0", () => {
    const noted = item(1392, { notedTemplate: 799, notedID: 1391 });
    expect(noted.inventoryModel).toBe(0);
    expect(noted.linkedIds()).toEqual([799, 1391]);
    noted.link((id) => all.get(id));
    expect(noted.inventoryModel).toBe(2429);
    expect(noted.zoom2d).toBe(1000);
    expect(noted.name).toBe("Battlestaff");
    expect(noted.stackable).toBe(1);
  });

  it("takes a placeholder's look from its template and its name from its item", () => {
    const held = item(8000, { placeholderTemplateId: 799, placeholderId: 1391 });
    held.link((id) => all.get(id));
    expect(held.inventoryModel).toBe(2429);
    expect(held.name).toBe("Battlestaff");
  });

  it("leaves ordinary items alone, and survives a missing template", () => {
    const plain = item(5, { name: "Rock", inventoryModel: 11 });
    expect(plain.linkedIds()).toEqual([]);
    plain.link(() => { throw new Error("nothing to look up"); });
    expect(plain.inventoryModel).toBe(11);
    const orphan = item(6, { notedTemplate: 1, notedID: 2 });
    orphan.link(() => undefined);
    expect(orphan.inventoryModel).toBe(0);
  });
});
