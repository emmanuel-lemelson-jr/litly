import { Style, Avatar } from "@dicebear/core";
import shadows from "@dicebear/styles/shadows.json" with { type: "json" };

// DiceBear "Shadows" (CC0): anonymous silhouettes, a fitting look for an anonymous
// site. 7 shoulders x 5 heads x 13 tops, in light pastel backgrounds with deep
// navy ink so they always read clearly, even at 26px.
const style = new Style(shadows);
const BACKGROUNDS = ["c9d1f5", "b8c4f2", "d5c8f2", "bfe3da", "f6d3c0", "f3dca0", "f5c6d6", "bfdff3", "d3e8bd", "e7e9f7"];
const INKS = ["1c2452", "262f6b", "2a2052", "17384a"];

window.avatarUri = (seed) =>
  new Avatar(style, {
    seed,
    borderRadius: 50,
    backgroundColor: BACKGROUNDS,
    inkColor: INKS,
  }).toDataUri();
