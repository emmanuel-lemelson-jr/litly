import { createAvatar } from "@dicebear/core";
import { funEmoji } from "@dicebear/collection";

// fun-emoji has 15 eyes x 15 mouths. To get far more variety for hundreds of
// users we widen the palette, mix solid/gradient backgrounds and add a slight tilt.
window.avatarUri = (seed) =>
  createAvatar(funEmoji, {
    seed,
    radius: 50,
    backgroundType: ["solid", "gradientLinear"],
    backgroundColor: ["fcbc34", "d84be5", "d9915b", "f6d594", "059ff2", "71cf62", "ff6b6b", "a78bfa", "2dd4bf", "fb923c", "f472b6", "d1fe17"],
    rotate: [-12, 12],
  }).toDataUri();
