// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Bundle } from "./cache/bundle";
import { drawWidgets } from "./widgets";

const bundle = new Bundle({ uiSprites: { 15: "data:image/png;base64,AA==" }, itemIcons: {}, models: {}, terrain: [] } as never);

describe("drawWidgets", () => {
  it("draws sprites, text and boxes where the game had them, faded by their opacity", () => {
    const parent = document.createElement("div");
    drawWidgets(parent, bundle, [
      [10, 20, 24, 24, 5, 15, "", 0, 0, -1, 0, 494, 0, 0, false, false],
      [0, 0, 100, 16, 4, -1, "Accurate", 0xff981f, 0, -1, 0, 495, 1, 1, true, false],
      [0, 40, 50, 10, 3, -1, "", 0x000000, 128, -1, 0, 494, 0, 0, false, false],
    ] as never, 190, 261, 190, 261);
    const box = parent.querySelector(".widgets")!;
    const sprite = box.querySelector<HTMLElement>(".wsprite")!;
    expect(sprite.style.left).toBe("10px");
    expect(sprite.style.top).toBe("20px");
    const text = box.querySelector<HTMLElement>(".wtext")!;
    expect(text.textContent).toBe("Accurate");
    expect(text.style.color).toBe("#ff981f");
    const rect = [...box.children].find((c) => (c as HTMLElement).style.background !== "" && !c.classList.length) as HTMLElement;
    expect(Number(rect.style.opacity)).toBeCloseTo(1 - 128 / 255, 2);
  });
});
