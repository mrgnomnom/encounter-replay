import * as THREE from "three";
import type { Bundle } from "./bundle";

/**
 * Game textures as three.js textures, made once per bundle. Animated ones (lava, flowing water) scroll
 * as in the client: a number of pixels per client cycle in one of four directions.
 */

const made = new WeakMap<Bundle, Map<number, THREE.Texture | null>>();

function texturesOf(bundle: Bundle): Map<number, THREE.Texture | null> {
  let byId = made.get(bundle);
  if (!byId) {
    byId = new Map();
    made.set(bundle, byId);
  }
  return byId;
}

function configure(texture: THREE.Texture): THREE.Texture {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // The client's texture coordinates start at the top of the image
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Decodes every texture's picture before the bundle is used. A texture still loading draws nothing, so
 * without this a textured face (the void floor, a cape) can be missing for its first moments, or from a
 * screenshot taken then
 */
export async function preloadTextures(bundle: Bundle): Promise<void> {
  const byId = texturesOf(bundle);
  await Promise.all(bundle.textureImageIds().map(async (id) => {
    const image = bundle.textureImage(id);
    if (!image || byId.has(id)) return;
    const picture = new Image();
    picture.src = image.png;
    try {
      await picture.decode();
    } catch {
      return;
    }
    const texture = configure(new THREE.Texture(picture));
    texture.needsUpdate = true;
    byId.set(id, texture);
  }));
}

export function textureFor(bundle: Bundle, id: number): THREE.Texture | undefined {
  const byId = texturesOf(bundle);
  let texture = byId.get(id);
  if (texture === undefined) {
    // Not preloaded: loads now, and draws once it has
    const image = bundle.textureImage(id);
    texture = image ? configure(new THREE.TextureLoader().load(image.png)) : null;
    byId.set(id, texture);
  }
  return texture ?? undefined;
}

// Textures are 128 pixels across; animated ones move this many pixels per unit of speed each cycle
const TEXTURE_SIZE = 128;

export function animateTextures(bundle: Bundle, cycle: number): void {
  const byId = made.get(bundle);
  if (!byId) return;
  for (const [id, texture] of byId) {
    const image = texture && bundle.textureImage(id);
    if (!texture || !image || !image.speed || !image.direction) continue;
    const shift = (image.speed * cycle) / TEXTURE_SIZE;
    // 1 down, 2 left, 3 up, 4 right
    if (image.direction === 1) texture.offset.set(0, -shift);
    else if (image.direction === 2) texture.offset.set(shift, 0);
    else if (image.direction === 3) texture.offset.set(0, shift);
    else if (image.direction === 4) texture.offset.set(-shift, 0);
  }
}
