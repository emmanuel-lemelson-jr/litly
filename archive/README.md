# Nightstand Alarm Clock Component (Archived)

Archived component featuring a bedside nightstand with a retro digital alarm clock that dynamically reflects the visitor's local time in angled red LED numerals.

## Files
- `nightstand.png`: High-resolution transparent PNG of the bedside nightstand with retro digital clock (680x880).
- `nightstand-clock-demo.html`: Standalone demo page showing the clock in action with live time and angle calibration.

## HTML Structure
```html
<div class="bed-scene">
  <div class="nightstand-wrap">
    <img class="nightstand-img" src="/nightstand.png" alt="Bedside nightstand" width="185" height="240" decoding="async">
    <div class="clock-face">
      <div class="solid-time-display">
        <span id="nightstand-time" class="solid-time"></span>
        <span id="nightstand-ampm" class="solid-ampm"></span>
      </div>
      <div class="glass-glare"></div>
    </div>
  </div>
  <img class="hero-gif" src="/sleepless.gif" alt="Tired character lying awake in bed" width="400" height="376" decoding="async">
</div>
```

## CSS Styles
```css
.bed-scene {
  position: relative;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  margin: 0 auto -52px;
  z-index: 1;
}
.nightstand-wrap {
  position: relative;
  width: clamp(120px, 20vw, 185px);
  margin-right: clamp(-18px, -2.5vw, -12px);
  margin-bottom: clamp(6px, 1.2vw, 14px);
  z-index: 0;
  flex-shrink: 0;
}
.nightstand-img {
  width: 100%;
  height: auto;
  display: block;
  filter: drop-shadow(0 15px 30px rgba(0,0,0,0.9));
}
.clock-face {
  position: absolute;
  left: 33.5%;
  top: 24%;
  width: 55%;
  height: 25%;
  transform: skewY(-9.5deg);
  transform-origin: left center;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.solid-time-display {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Rounded", "SF Pro Display", sans-serif;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.solid-time {
  font-size: clamp(20px, 3.4vw, 32px);
  color: #ff3b30;
  text-shadow:
    0 0 2px #fff,
    0 0 6px #ff3b30,
    0 0 16px rgba(255, 59, 48, 0.9),
    0 0 28px rgba(255, 59, 48, 0.5);
}
.solid-colon {
  margin: 0 1px;
  position: relative;
  top: -2px;
  display: inline-block;
}
.solid-ampm {
  font-size: clamp(7px, 1.2vw, 11px);
  font-weight: 800;
  color: #ff3b30;
  margin-left: 3px;
  text-shadow: 0 0 6px rgba(255, 59, 48, 0.9);
}
.glass-glare {
  position: absolute;
  inset: -2px 0 0 -2px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.02) 40%, transparent 42%);
  pointer-events: none;
}
```

## JavaScript
```javascript
function updateNightstandClock() {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const timeEl = document.getElementById("nightstand-time");
  const ampmEl = document.getElementById("nightstand-ampm");
  if (timeEl) timeEl.innerHTML = `${h}<span class="solid-colon">:</span>${m}`;
  if (ampmEl) ampmEl.textContent = ampm;
}
```
