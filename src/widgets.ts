import type { Bundle } from "./cache/bundle";

/**
 * Draws an interface snapshot the recorder took ("ui_widgets"): every sprite, text, item and filled box
 * the game showed, where it showed them. Each widget is
 * [x, y, w, h, type, sprite, text, colour, opacity, item, quantity, font, xAlign, yAlign, shadow, tiled]
 */

type Widget = [number, number, number, number, number, number, string, number, number, number, number, number, number, number, boolean, boolean];

// The game's interface fonts, roughly: small, regular, bold, and the fancy quill
const FONTS: Record<number, string> = {
  494: "11px",
  495: "12px",
  496: "bold 12px",
  497: "13px",
};

const hex = (rgb: number) => `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;

export function drawWidgets(parent: HTMLElement, bundle: Bundle, widgets: Widget[], width: number, height: number, areaW: number, areaH: number): void {
  const box = document.createElement("div");
  box.className = "widgets";
  // Fit the interface into the side panel's content area, as the game does at its fixed size
  const scale = Math.min(1, areaW / Math.max(1, width), areaH / Math.max(1, height));
  Object.assign(box.style, { width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` });
  parent.appendChild(box);
  for (const [x, y, w, h, type, sprite, text, color, opacity, item, qty, font, xAlign, yAlign, shadow, tiled] of widgets) {
    const alpha = 1 - opacity / 255;
    if (alpha <= 0) continue;
    const at = { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, opacity: String(alpha) };
    if (type === 3) {
      const rect = document.createElement("div");
      Object.assign(rect.style, at, { background: hex(color) });
      box.appendChild(rect);
    }
    if (sprite > 0) {
      const src = bundle.uiSprite(sprite);
      if (src) {
        const el = document.createElement("div");
        el.className = "wsprite";
        Object.assign(el.style, at, { backgroundImage: `url(${src})`, backgroundRepeat: tiled ? "repeat" : "no-repeat" });
        box.appendChild(el);
      }
    }
    if (item > 0) {
      const icon = bundle.itemIcon(item, qty);
      if (icon) {
        const img = document.createElement("img");
        img.className = "wsprite";
        img.src = icon;
        Object.assign(img.style, { left: `${x}px`, top: `${y}px`, opacity: String(alpha) });
        box.appendChild(img);
      }
    }
    if (text) {
      const t = document.createElement("div");
      t.className = "wtext";
      t.textContent = text;
      Object.assign(t.style, at, {
        color: hex(color),
        font: `${FONTS[font] ?? "11px"} "RuneScape Small", Verdana, sans-serif`,
        justifyContent: ["flex-start", "center", "flex-end"][xAlign] ?? "flex-start",
        alignItems: ["flex-start", "center", "flex-end"][yAlign] ?? "flex-start",
        textAlign: ["left", "center", "right"][xAlign] ?? "left",
        textShadow: shadow ? "1px 1px 0 #000" : "none",
      });
      box.appendChild(t);
    }
  }
}
