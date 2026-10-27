/**
 * Ko-fi support links, drawn by the page itself. Ko-fi's own widgets run Ko-fi's scripts inside the page,
 * which the security policy rules out (they could read whatever the page reads), so these are plain links
 * that open Ko-fi in a new tab: nothing is loaded from Ko-fi until someone clicks.
 */

export const KOFI_URL = "https://ko-fi.com/mrgnome";
const BUTTON_TEXT = "Buy me a Short Green Guy";

/** A cup with a heart on it, in the spirit of Ko-fi's, drawn here rather than loaded from them */
function cupIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("kofi-cup");
  const cup = document.createElementNS(ns, "path");
  cup.setAttribute("d", "M3 6h14v7a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V6zm14 2h1.5a3.5 3.5 0 0 1 0 7H17");
  cup.setAttribute("fill", "none");
  cup.setAttribute("stroke", "currentColor");
  cup.setAttribute("stroke-width", "2");
  cup.setAttribute("stroke-linejoin", "round");
  const heart = document.createElementNS(ns, "path");
  heart.setAttribute("d", "M10 15.2l-2.6-2.5a1.6 1.6 0 0 1 2.3-2.3l.3.3.3-.3a1.6 1.6 0 0 1 2.3 2.3z");
  heart.setAttribute("fill", "currentColor");
  svg.append(cup, heart);
  return svg;
}

/** The big pill button, for the landing page and the support card */
export function kofiButton(): HTMLAnchorElement {
  const a = document.createElement("a");
  a.className = "kofi-button";
  a.href = KOFI_URL;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = "Support the replay on Ko-fi (opens in a new tab)";
  a.append(cupIcon(), document.createTextNode(BUTTON_TEXT));
  return a;
}

/** In the replay: a quiet Donate link at the far end of the header that drops down a card with the Ko-fi button */
export function addSupport(parent: HTMLElement): void {
  const wrap = document.createElement("div");
  wrap.className = "kofi-corner";
  const card = document.createElement("div");
  card.className = "kofi-card";
  card.hidden = true;
  const close = document.createElement("button");
  close.className = "kofi-close";
  close.textContent = "×";
  close.title = "Close";
  const title = document.createElement("b");
  title.textContent = "Enjoying the replay?";
  const text = document.createElement("p");
  text.textContent = "It's free, and everything runs on your computer. If it helped you learn a fight, a Short Green Guy keeps it going.";
  card.append(close, title, text, kofiButton());
  const pill = document.createElement("button");
  pill.className = "kofi-pill";
  pill.title = "Support the replay";
  pill.append(cupIcon(), document.createTextNode("Donate"));
  pill.onclick = () => (card.hidden = !card.hidden);
  close.onclick = () => (card.hidden = true);
  wrap.append(pill, card);
  parent.append(wrap);
  // A click anywhere else puts the card away
  document.addEventListener("click", (e) => {
    if (!card.hidden && !wrap.contains(e.target as Node)) card.hidden = true;
  });
}
