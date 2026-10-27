/**
 * Ko-fi support links, drawn by the page itself. Ko-fi's own widgets run Ko-fi's scripts inside the page,
 * which the security policy rules out (they could read whatever the page reads), so these are plain links
 * that open Ko-fi in a new tab: nothing is loaded from Ko-fi until someone clicks.
 */

export const KOFI_URL = "https://ko-fi.com/mrgnome";
const BUTTON_TEXT = "Buy me a Short Green Guy";
export const GITHUB_URL = "https://github.com/mrgnomnom/encounter-replay";

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

/** GitHub's mark, drawn here like the cup */
function githubIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("github-mark");
  const mark = document.createElementNS(ns, "path");
  mark.setAttribute("d", "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z");
  mark.setAttribute("fill", "currentColor");
  svg.append(mark);
  return svg;
}

/** A link to the page's source on GitHub: a pill beside the Ko-fi button, or quiet text in the header */
export function githubLink(style: "button" | "quiet"): HTMLAnchorElement {
  const a = document.createElement("a");
  a.className = style === "button" ? "github-button" : "github-quiet";
  a.href = GITHUB_URL;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = "The replay's source code on GitHub (opens in a new tab)";
  a.append(githubIcon(), document.createTextNode(style === "button" ? "View on GitHub" : "GitHub"));
  return a;
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
  parent.append(githubLink("quiet"), wrap);
  // A click anywhere else puts the card away
  document.addEventListener("click", (e) => {
    if (!card.hidden && !wrap.contains(e.target as Node)) card.hidden = true;
  });
}
