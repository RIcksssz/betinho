/* Hero: scroll orbits a camera around the statue.
   Frames come from tools/build-frames.py (WebP with alpha) and are drawn on a canvas, so the giant words
   sit behind the statue. Scroll progress p (0..1 over the section) maps to film progress b = p / HOLD;
   the rest of the scroll holds the last frame under the closing line.
   Stage ranges are in film progress. For an 8 s clip: orbit 0 to ~4.5 s (b .56), push-in after. */
(() => {
  const hero = document.querySelector(".hero");
  const root = document.documentElement;
  if (!hero || !root.classList.contains("wow-js") || root.classList.contains("wow-still") || !window.ScrollTrigger) return;

  const N = parseInt(hero.dataset.frames, 10) || 0;
  const HOLD = parseFloat(hero.dataset.hold) || 0.9;
  const FADE = 0.045;
  const STAGES = [[0, 0.17], [0.17, 0.36], [0.36, 0.56], [0.74, 1]];
  const BRONZE_FROM = 0.68, BRONZE_LEN = 0.14;

  const els = STAGES.map((_, i) => [...hero.querySelectorAll(`[data-stage="${i}"]`)]);
  const cta = hero.querySelector(".cta");
  const cv = hero.querySelector(".film");
  const ctx = cv.getContext("2d");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ---------- frames ----------
  const frames = [];
  let loaded = 0, want = 0, drawn = -1, raf = 0;
  const ok = im => im && im.complete && im.naturalWidth > 0;
  const nearest = i => { for (let k = i; k >= 0; k--) if (ok(frames[k])) return frames[k]; return null; };
  const draw = f => {
    const i = Math.floor(f), t = f - i;
    const a = nearest(i), b = ok(frames[Math.min(N - 1, i + 1)]) ? frames[Math.min(N - 1, i + 1)] : null;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (a) ctx.drawImage(a, 0, 0);
    if (b && b !== a && t > 0.02) { ctx.globalAlpha = t; ctx.drawImage(b, 0, 0); ctx.globalAlpha = 1; }
  };
  const paint = () => { raf = 0; if (Math.abs(want - drawn) > 0.005) { drawn = want; draw(want); } };
  const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };

  for (let i = 0; i < N; i++) {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      loaded++;
      if (i === 0) { cv.width = im.naturalWidth; cv.height = im.naturalHeight; hero.classList.add("is-ready"); }
      drawn = -1; queue();
    };
    im.onerror = () => { if (i === 0) hero.classList.remove("is-ready"); };   // frame 0 missing: the still stays
    im.src = `assets/frames/f${String(i).padStart(3, "0")}.webp`;
    frames.push(im);
  }

  // ---------- stages ----------
  const setStage = (i, b) => {
    const [a, z] = STAGES[i];
    const inR = i === 0 ? 1 : (b - a) / FADE;
    const outR = i === STAGES.length - 1 ? 1 : (z - b) / FADE;
    const vis = clamp(Math.min(inR, outR));
    const sp = clamp((b - a) / (z - a));
    els[i].forEach(el => { el.style.setProperty("--vis", vis.toFixed(3)); el.style.setProperty("--sp", sp.toFixed(3)); });
    return vis;
  };

  let lastOn = -1;
  const apply = p => {
    const b = clamp(p / HOLD);
    if (N) { want = b * (N - 1); queue(); }
    let on = -1;
    STAGES.forEach((_, i) => { if (setStage(i, b) > 0.5) on = i; });
    // the statue starts smaller than the frame (k0) and grows to fill it as the push-in begins
    const k0 = innerWidth < 900 ? 0.56 : 0.9, ty0 = innerWidth < 900 ? -3 : 1;
    const g = clamp((b - 0.5) / 0.22), e = g * g * (3 - 2 * g);
    hero.style.setProperty("--k", (k0 + (1 - k0) * e).toFixed(4));
    hero.style.setProperty("--ty", (ty0 * (1 - e)).toFixed(3) + "svh");
    const bronze = N ? clamp((b - BRONZE_FROM) / BRONZE_LEN) : 0;
    hero.style.setProperty("--bronze", bronze.toFixed(3));
    root.classList.toggle("is-late", bronze > 0.55);
    if (cta && on !== lastOn) { cta.tabIndex = on === 3 ? 0 : -1; lastOn = on; }
  };

  ScrollTrigger.create({ trigger: hero, start: "top top", end: "bottom bottom", invalidateOnRefresh: true,
    onUpdate: st => apply(st.progress), onRefresh: st => apply(st.progress) });
  apply(0);
})();
