// Ported from RuneLite's cache library (net.runelite.cache.models.JagexColor, BSD-2-Clause, see LICENSE in
// src/cache/store). The game's 16-bit HSL colours and the palette the item renderer turns them into.
import { d2i } from "./intMath";

export const BRIGHTNESS_MAX = 0.6;
export const BRIGHTNESS_HIGH = 0.7;
export const BRIGHTNESS_LOW = 0.8;
export const BRIGHTNESS_MIN = 0.9;

const HUE_OFFSET = 0.5 / 64.0;
const SATURATION_OFFSET = 0.5 / 8.0;

export function unpackHue(hsl: number): number {
  return hsl >> 10 & 63;
}

export function unpackSaturation(hsl: number): number {
  return hsl >> 7 & 7;
}

export function unpackLuminance(hsl: number): number {
  return hsl & 127;
}

export function HSLtoRGB(hsl: number, brightness: number): number {
  const hue = unpackHue(hsl) / 64.0 + HUE_OFFSET;
  const saturation = unpackSaturation(hsl) / 8.0 + SATURATION_OFFSET;
  const luminance = unpackLuminance(hsl) / 128.0;
  const chroma = (1.0 - Math.abs(2.0 * luminance - 1.0)) * saturation;
  const x = chroma * (1 - Math.abs(hue * 6.0 % 2.0 - 1.0));
  const lightness = luminance - chroma / 2;
  let r = lightness;
  let g = lightness;
  let b = lightness;
  switch (d2i(hue * 6.0)) {
    case 0:
      r += chroma;
      g += x;
      break;
    case 1:
      g += chroma;
      r += x;
      break;
    case 2:
      g += chroma;
      b += x;
      break;
    case 3:
      b += chroma;
      g += x;
      break;
    case 4:
      b += chroma;
      r += x;
      break;
    default:
      r += chroma;
      b += x;
      break;
  }
  let rgb = d2i(r * 256.0) << 16 | d2i(g * 256.0) << 8 | d2i(b * 256.0);
  rgb = adjustForBrightness(rgb, brightness);
  if (rgb === 0) {
    rgb = 1;
  }
  return rgb;
}

export function adjustForBrightness(rgb: number, brightness: number): number {
  let r = (rgb >> 16) / 256.0;
  let g = (rgb >> 8 & 255) / 256.0;
  let b = (rgb & 255) / 256.0;
  r = Math.pow(r, brightness);
  g = Math.pow(g, brightness);
  b = Math.pow(b, brightness);
  return d2i(r * 256.0) << 16 | d2i(g * 256.0) << 8 | d2i(b * 256.0);
}

export function createPalette(brightness: number): Int32Array {
  const colorPalette = new Int32Array(65536);
  for (let i = 0; i < colorPalette.length; i++) {
    colorPalette[i] = HSLtoRGB(i << 16 >> 16, brightness);
  }
  return colorPalette;
}
