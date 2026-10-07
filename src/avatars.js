import { Style, Avatar } from "@dicebear/core";
import shadows from "@dicebear/styles/shadows.json" with { type: "json" };

// DiceBear "Shadows" (CC0): anonymous silhouettes, a fitting look for an anonymous
// site. 7 shoulders x 5 heads x 13 tops. Colors come in matched [background, ink]
// pairs picked from the seed, so contrast is guaranteed and avatars don't all look
// alike: light backgrounds with dark ink, rich mid-tones, and dark backgrounds with
// light ink.
const style = new Style(shadows);
const PAIRS = [
  // light background, deep ink
  ["c9d1f5", "1c2452"], ["d5c8f2", "2a2052"], ["bfe3da", "17384a"], ["f6d3c0", "4a2630"],
  ["f3dca0", "3b2f12"], ["f5c6d6", "5a1f3c"], ["bfdff3", "0f3350"], ["d3e8bd", "1f3d24"],
  // rich mid-tone background, deep ink
  ["8fa0e6", "1c2452"], ["7cc4ee", "0f3350"], ["f09bb4", "4a1530"], ["f4b393", "4a2312"],
  ["a9d58f", "1f3d1b"], ["b79cf0", "2d1b5e"], ["f2d27a", "4a3410"], ["6fd3c0", "0d3b36"],
  // dark background, light ink
  ["26305f", "c9d1f5"], ["3b2c63", "d5c8f2"], ["1d4252", "bfe3da"], ["5b2f48", "f5c6d6"],
  ["2f4a3f", "d3e8bd"], ["4a3a2a", "f3dca0"], ["1f2a44", "8fa0e6"], ["4a2150", "e7c6f5"],
];

function pairFor(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return PAIRS[(h >>> 0) % PAIRS.length];
}

window.avatarUri = (seed) => {
  const [bg, ink] = pairFor(seed);
  return new Avatar(style, { seed, borderRadius: 50, backgroundColor: [bg], inkColor: [ink] }).toDataUri();
};
