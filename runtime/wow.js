/* wow.js: choreography runtime for the `wow` skill.
   Needs (vendored, loaded before this file): gsap, ScrollTrigger, SplitText; lenis optional.
   Everything is driven by data attributes so pages stay plain HTML:

   data-wow="chars"   per-letter tilt-in (headlines, display words)
   data-wow="lines"   masked line rise (statements, paragraphs)
   data-wow="fade"    opacity + small rise (labels, buttons, small blocks)
   data-wow="wipe"    diagonal image wipe with inner zoom-out (figures: put the <img> as first child)
   data-wow="draw"    SVG strokes draw in, scrubbed with scroll (put on <svg>, strokes need pathLength="1")
   data-wow-delay="0.2"           extra delay in seconds
   data-wow-parallax="10"         yPercent drift, + moves against scroll, - moves with it
   data-wow-handoff="disc"        section's ground grows as a disc over the previous act's ground (content never covered)
   <ol data-wow-stops>            beside a data-wow="draw" svg: li[data-at="0..1"] are placed on its path
   data-wow-pin="4"               (desktop) pins the section's [data-wow-stage] (100vh) for N viewports;
                                  children with data-wow-step get .is-on one after another
   data-wow-hscroll               (desktop AND phone) vertical scroll becomes sideways travel. Structure:
                                  <section data-wow-hscroll>
                                    <div data-wow-hzoom>title</div>            optional: scales 0 -> 1 as the section arrives, fades as cards take over
                                    <div data-wow-hview><div data-wow-htrack>cards...</div></div>
                                  </section>
                                  data-wow-hdrift="1" scales the per-card tilt/drift (0 = none; phones get 0.4x automatically).
                                  Section height is set here (track width + one viewport): do not set it in CSS.
   data-wow-scrub="4"             (desktop AND phone) scroll-scrubbed video act: the section is N+1 viewports tall, its [data-wow-scrub-view]
                                  child is sticky for 100svh. Inside: <video data-wow-scrub-video muted playsinline preload="auto" src poster>
                                  is driven by scroll (currentTime = progress). Sets --scrub (0..1 raw) and --scrub-b (0..1 build, done at
                                  data-wow-scrub-hold, default 0.85) on the section for CSS-driven labels. An optional [data-wow-scrub-after]
                                  (position it yourself) fades in over the last stretch, so the clip can land on the real photo. A failing
                                  clip adds .wow-scrub-failed (the after element then shows). Encode the clip all-intra (ffmpeg -g 1).
                                  Still mode: the video is not driven; the after element shows. Do not set the section height in CSS.
   .wow-seam                      zero-height element between sections; its .wow-cut children paint over both acts
   data-wow-drift="-5,25"         xPercent from,to across the act (give each title line different numbers)
   data-wow-ink                   chrome part whose OWN centre decides its ink: gets .is-dark inside a data-wow-theme="dark" act
   --- micro-interactions: fine pointer + desktop only, never in still mode; each also fires on keyboard focus ---
   data-wow-magnetic="25"         element leans toward the cursor; children [data-wow-inner] lean 1.5x further; elastic return
   data-wow-swap                  <a|button><span>Text</span><span>Text</span></a> letters roll out/in on hover, underline retracts
   data-wow-ring                  link with <circle data-arc>: arc grows from a tick to a half circle
   data-wow-tip="id" + data-wow-tip-for="id"   cursor-following label (2.4s lag), flips near the viewport edge
   [data-wow-badge]               rotates continuously, spins faster with scroll velocity
   [data-wow-progress]            gets --p (0..1) page progress
   data-wow-theme="dark"          while this section is under the chrome, <html> has .wow-dark (still mode too)
   video[data-wow-autoplay]       muted loop video started only when motion is allowed (never use `autoplay`)
   [data-wow-loader]              preloader: holds, then opens a shape on the hero, then removes itself
*/
(() => {
  const { gsap, ScrollTrigger, SplitText } = window;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desk = matchMedia("(min-width: 900px)").matches;
  const root = document.documentElement;
  root.classList.add("wow-js");

  // Shared constants (measured on the reference build; change per brand only with reason).
  const DUR = { s: 0.4, m: 0.8, l: 1.2 };
  const EASE = { out: "wowOut", inOut: "wowInOut" };
  const loader = document.querySelector("[data-wow-loader]");

  // Chrome ink follows the ground under it. Not motion, so it runs in still mode too (no GSAP needed):
  // a 1px band at y=40 tells which act sits under the chrome.
  const darks = document.querySelectorAll('[data-wow-theme="dark"]');
  if (darks.length && "IntersectionObserver" in window) {
    const under = new Set();
    const io = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? under.add(e.target) : under.delete(e.target)); root.classList.toggle("wow-dark", under.size > 0); },
      { rootMargin: `-40px 0px ${-(innerHeight - 41)}px 0px` });
    darks.forEach(d => io.observe(d));
  }

  // Per-element ink (reference: each chrome part decides by its OWN centre, so the logo can be dark while
  // the nav is light). [data-wow-ink] gets .is-dark while its centre is inside a [data-wow-theme="dark"] act.
  // Not motion: runs in still mode too.
  const inks = [...document.querySelectorAll("[data-wow-ink]")];
  if (inks.length && darks.length) {
    let raf = 0;
    const run = () => { raf = 0; inks.forEach(el => { const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      el.classList.toggle("is-dark", [...darks].some(d => { const b = d.getBoundingClientRect(); return b.top <= y && b.bottom > y && b.left <= x && b.right > x; })); }); };
    const q = () => raf || (raf = requestAnimationFrame(run));
    addEventListener("scroll", q, { passive: true }); addEventListener("resize", q); run();
  }

  if (reduced || !gsap || !ScrollTrigger || !SplitText) {
    loader?.remove();
    root.classList.add("wow-still");
    return;
  }
  // ambient video plays only with motion allowed (no `autoplay` attribute in the HTML; posters cover still mode)
  document.querySelectorAll("video[data-wow-autoplay]").forEach(v => { v.muted = true; v.play().catch(() => {}); });

  gsap.registerPlugin(ScrollTrigger, SplitText);
  // phones: the URL bar showing/hiding fires resize; without this every trigger jumps (needed by hscroll)
  ScrollTrigger.config({ ignoreMobileResize: true });
  // cubic-bezier(.25,1,.5,1) and (.75,0,.25,1) from the reference build ≈ power3.out / power3.inOut
  gsap.registerEase("wowOut", gsap.parseEase("power3.out"));
  gsap.registerEase("wowInOut", gsap.parseEase("power3.inOut"));

  // Smooth wheel (desktop pointer only). Lenis duration 1.2 + expo-out is the measured feel.
  let lenis = null;
  if (window.Lenis && matchMedia("(pointer: fine)").matches) {
    lenis = new Lenis({ duration: 1.2, smoothWheel: true, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    // in-page anchors go through lenis so they ease instead of jumping
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || a.getAttribute("href").length < 2) return;
      const t = document.querySelector(a.getAttribute("href"));
      if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: 0 }); t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
    });
  }
  window.wow = { lenis, gsap, ScrollTrigger };

  // ---------- pinned step sequences (desktop) ----------
  // Created FIRST: ScrollTrigger measures in creation order, so any trigger made before a pin
  // ignores that pin's spacer and fires viewports too early.
  document.querySelectorAll("[data-wow-pin]").forEach(sec => {
    const steps = [...sec.querySelectorAll("[data-wow-step]")];
    const set = i => { steps.forEach((s, k) => s.classList.toggle("is-on", k === i)); sec.style.setProperty("--step", i); sec.dataset.step = i; };
    set(0);
    if (!desk) { steps.forEach(s => s.classList.add("is-on")); return; }
    const n = parseFloat(sec.dataset.wowPin) || steps.length;
    const stage = sec.querySelector("[data-wow-stage]") || sec; // pin the 100vh stage, not the section
    ScrollTrigger.create({ trigger: stage, start: "top top", end: `+=${n * 100}%`, pin: stage, scrub: true,
      onUpdate: st => { set(Math.min(steps.length - 1, Math.floor(st.progress * steps.length))); sec.style.setProperty("--pp", st.progress.toFixed(3)); } });
  });

  // ---------- sideways scroll (desktop and phone) ----------
  // The section is tall; [data-wow-hview] is sticky for 100svh inside it, so no pin spacer is involved.
  // Scroll distance == track width, so one pixel of scroll is one pixel of travel. Created right after the
  // pins and before every other trigger because it changes page height.
  document.querySelectorAll("[data-wow-hscroll]").forEach(sec => {
    const view = sec.querySelector("[data-wow-hview]"), track = sec.querySelector("[data-wow-htrack]");
    if (!view || !track) return;
    const zoom = sec.querySelector("[data-wow-hzoom]");
    const size = () => { sec.style.height = track.scrollWidth + view.offsetHeight + "px"; };
    size(); ScrollTrigger.addEventListener("refreshInit", size);

    if (zoom) {
      gsap.fromTo(zoom, { scale: 0 }, { scale: 1, ease: "power2.inOut",
        scrollTrigger: { trigger: sec, start: "top bottom", end: "top top", scrub: true } });
      gsap.to(zoom, { opacity: 0, ease: "none",
        scrollTrigger: { trigger: sec, start: "top top", end: () => "+=" + innerHeight * 0.6, scrub: true, invalidateOnRefresh: true } });
    }
    const slide = gsap.to(track, { xPercent: -100, ease: "none",
      scrollTrigger: { trigger: sec, start: "top top", end: "bottom bottom", scrub: true, invalidateOnRefresh: true } });

    // per-card tilt and drift, tied to the slide via containerAnimation (deterministic: same on every load)
    const k = (parseFloat(sec.dataset.wowHdrift) || (sec.dataset.wowHdrift === "0" ? 0 : 1)) * (desk ? 1 : 0.4);
    if (k) [...track.children].forEach((card, i) => {
      const s = i % 2 ? -1 : 1, v = Math.abs(Math.sin(i * 12.9898)); // 0..1 pseudo random
      const x = (20 + 10 * v) * s * k, r = (5 + 5 * v) * s * k, y = (i % 2 ? -15 : 15) * k;
      gsap.fromTo(card, { rotation: r, xPercent: x, yPercent: y }, { rotation: -r, xPercent: -x, yPercent: -y, ease: "none",
        scrollTrigger: { trigger: card, containerAnimation: slide, start: "left 120%", end: "right -20%", scrub: true } });
    });
  });

  // ---------- scroll-scrubbed video (desktop and phone) ----------
  // Sticky like the sideways scroll (no pin spacer), so it is created right after it and before every other trigger.
  document.querySelectorAll("[data-wow-scrub]").forEach(sec => {
    sec.style.setProperty("--n", parseFloat(sec.dataset.wowScrub) || 4);
    const hold = parseFloat(sec.dataset.wowScrubHold) || 0.85;
    sec.style.setProperty("--hold", hold);
    const vid = sec.querySelector("video[data-wow-scrub-video]");
    let dur = 0;
    if (vid) {
      vid.muted = true; vid.pause();
      const ready = () => { dur = vid.duration; };
      vid.addEventListener("loadedmetadata", ready);
      vid.addEventListener("error", () => sec.classList.add("wow-scrub-failed"));
      if (vid.readyState >= 1) ready();
    }
    ScrollTrigger.create({ trigger: sec, start: "top top", end: "bottom bottom", invalidateOnRefresh: true, onUpdate: st => {
      const b = Math.min(1, st.progress / hold);
      sec.style.setProperty("--scrub", st.progress.toFixed(4));
      sec.style.setProperty("--scrub-b", b.toFixed(4));
      if (vid && dur && isFinite(dur)) { const t = b * (dur - 0.04); if (Math.abs(vid.currentTime - t) > 1 / 48) vid.currentTime = t; }
    } });
  });

  // ---------- entrance reveals (play once, on enter) ----------
  const rise = desk ? "3.3rem" : "2rem";
  // aria-label only names headings, links and buttons; on a span or p it is ignored and the split text
  // would vanish for screen readers. Those get aria-hidden plus a visually hidden copy instead.
  const aria = el => {
    if (el.matches("h1,h2,h3,h4,h5,h6,a,button")) return "auto";
    el.insertAdjacentHTML("afterend", `<span class="wow-sr">${el.textContent.trim().replace(/</g, "&lt;")}</span>`);
    return "hidden";
  };
  const setups = {
    chars(el) {
      const s = new SplitText(el, { type: "words,chars", charsClass: "wow-ch", wordsClass: "wow-w", aria: aria(el) });
      const n = s.chars.length, st = Math.min(0.06, 0.7 / n);
      gsap.set(el, { perspective: 600 });
      gsap.set(s.chars, { opacity: 0, rotateX: -90, x: "-0.6em", transformOrigin: "50% 0%" });
      return d => gsap.to(s.chars, { opacity: 1, rotateX: 0, x: 0, duration: DUR.l, ease: EASE.out, stagger: st, delay: d });
    },
    lines(el) {
      const s = new SplitText(el, { type: "lines", mask: "lines", linesClass: "wow-ln", aria: aria(el) });
      gsap.set(s.lines, { yPercent: 110 });
      return d => gsap.to(s.lines, { yPercent: 0, duration: DUR.l, ease: EASE.out, stagger: 0.1, delay: d });
    },
    fade(el) {
      gsap.set(el, { opacity: 0, y: rise });
      return d => gsap.to(el, { opacity: 1, y: 0, duration: DUR.l, ease: EASE.out, delay: d });
    },
    wipe(el) {
      const img = el.firstElementChild;
      gsap.set(el, { clipPath: "polygon(100% 0%, 100% 0%, 101% 100%, 125% 100%)" });
      if (img) gsap.set(img, { scale: 1.5, xPercent: 25 });
      return d => {
        gsap.to(el, { clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)", duration: DUR.l * 1.25, ease: EASE.inOut, delay: d });
        if (img) gsap.to(img, { scale: 1, xPercent: 0, duration: DUR.l * 1.25, ease: EASE.inOut, delay: d });
      };
    },
  };
  const held = []; // reveals inside the hero wait for the loader
  document.querySelectorAll("[data-wow]").forEach(el => {
    const kind = el.dataset.wow;
    if (kind === "draw") return;
    const make = setups[kind]; if (!make) return;
    const play = make(el);
    const d = 0.3 + parseFloat(el.dataset.wowDelay || 0);
    if (loader && el.closest("[data-wow-hero]")) { held.push(() => play(d)); return; }
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => play(d) });
  });

  // ---------- scrubbed strokes ----------
  document.querySelectorAll('[data-wow="draw"]').forEach(svg => {
    const paths = svg.querySelectorAll("[pathLength]");
    gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.to(paths, { strokeDashoffset: 0, ease: "none", stagger: 0.15,
      scrollTrigger: { trigger: svg, start: "top 85%", end: "bottom 45%", scrub: 0.5 } });
  });

  // ---------- route stops sit on the drawn line: <ol data-wow-stops> next to the svg, li[data-at="0..1"] ----------
  document.querySelectorAll("[data-wow-stops]").forEach(ol => {
    const box = ol.parentElement, path = box.querySelector('[data-wow="draw"] path');
    if (!path) return;
    const lay = () => {
      if (getComputedStyle(path.ownerSVGElement).display === "none") return;
      const b = box.getBoundingClientRect(), len = path.getTotalLength(), m = path.getScreenCTM();
      ol.querySelectorAll("li[data-at]").forEach(li => {
        const pt = path.getPointAtLength(len * parseFloat(li.dataset.at)).matrixTransform(m);
        li.style.left = pt.x - b.left + "px"; li.style.top = pt.y - b.top + "px";
      });
    };
    lay(); ScrollTrigger.addEventListener("refresh", lay);
  });

  // ---------- parallax planes ----------
  document.querySelectorAll("[data-wow-parallax]").forEach(el => {
    const a = parseFloat(el.dataset.wowParallax) || 10;
    gsap.fromTo(el, { yPercent: -a }, { yPercent: a, ease: "none",
      scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: 0.5 } });
  });

  // ---------- section handoffs: the next act rises inside a shape ----------
  // The section keeps its place in the flow (nothing of the previous act is covered). It paints the
  // previous act's ground (--prev-bg) and its own ground (--bg) in ::before, clipped to a disc whose
  // centre sits one viewport + k*vw below its top; the disc grows until it covers (big radius = gentle arc).
  const prevAct = sec => { let p = sec.previousElementSibling; while (p && !p.matches("section")) p = p.previousElementSibling; return p; };
  const groundOf = el => (el && (getComputedStyle(el).getPropertyValue("--bg").trim() || getComputedStyle(el).backgroundColor)) || "";
  // The disc starts touching the section's top edge (r = cy) and ends exactly covering its top corners,
  // so the dome is on screen for the whole entry. Smaller k = taller dome.
  document.querySelectorAll("[data-wow-handoff]").forEach(sec => {
    const cy = () => innerWidth * (desk ? 0.75 : 0.6);
    const place = () => { sec.style.setProperty("--hcy", cy() + "px"); sec.style.setProperty("--prev-bg", groundOf(prevAct(sec))); };
    place(); ScrollTrigger.addEventListener("refreshInit", place);
    gsap.fromTo(sec, { "--hr": () => cy() + "px" }, { "--hr": () => Math.hypot(innerWidth / 2, cy()) + 2 + "px", ease: "none", immediateRender: true,
      scrollTrigger: { trigger: sec, start: "top bottom", end: "top 12%", scrub: 0.5, invalidateOnRefresh: true, onEnter: place, onEnterBack: place,
        // once open, drop the clip so long pinned acts can never meet the disc edge
        onLeave: () => sec.classList.add("wow-open"), onEnterBack: () => sec.classList.remove("wow-open") } });
  });

  // ---------- title drift: lines of one title slide in different directions across their act ----------
  // data-wow-drift="from,to" in xPercent (reference: -5,25,-15 to 5,-25,25 on three lines, scrub .25)
  document.querySelectorAll("[data-wow-drift]").forEach(el => {
    const [a, b] = el.dataset.wowDrift.split(",").map(parseFloat);
    gsap.fromTo(el, { xPercent: a || 0 }, { xPercent: b || 0, ease: "none",
      scrollTrigger: { trigger: el.closest("section") || el.parentElement, start: "top bottom", end: "bottom top", scrub: 0.25 } });
  });

  // ---------- micro-interactions (fine pointer + desktop only; touch and reduced motion never get them) ----------
  // Numbers measured on the reference build: elastic return 1.6s, char swap 0.8s, tip lag 2.4s.
  if (desk && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    // magnetic: data-wow-magnetic="25" pulls the element toward the cursor (strength / 16 em); children with
    // data-wow-inner move a little further, so the label floats over the button
    document.querySelectorAll("[data-wow-magnetic]").forEach(el => {
      const s = parseFloat(el.dataset.wowMagnetic) || 25, inner = [...el.querySelectorAll("[data-wow-inner]")];
      const to = (t, fx, fy, k, d) => gsap.to(t, { x: fx * k / 16 + "em", y: fy * k / 16 + "em", force3D: true, ease: "power4.out", duration: d, overwrite: "auto" });
      el.addEventListener("pointermove", e => { const b = el.getBoundingClientRect(), fx = (e.clientX - b.left) / b.width - 0.5, fy = (e.clientY - b.top) / b.height - 0.5;
        to(el, fx, fy, s, 1.6); inner.forEach(i => to(i, fx, fy, s * 1.5, 2)); });
      el.addEventListener("pointerleave", () => [el, ...inner].forEach(t => gsap.to(t, { x: 0, y: 0, ease: "elastic.out(1, 0.3)", duration: 1.6, overwrite: "auto" })));
    });

    // letter swap: <a data-wow-swap><span>Visit</span><span>Visit</span></a>. Letters of the first span rotate out,
    // the second rolls in, and a hairline underline retracts. Also fires on keyboard focus.
    document.querySelectorAll("[data-wow-swap]").forEach(el => {
      const [a, b] = el.children; if (!b) return;
      if (!el.matches("a,button")) return;                       // the accessible name lives on a link/button
      el.classList.add("wow-swap-on");
      el.insertAdjacentHTML("beforeend", `<span class="wow-sr">${a.textContent.trim().replace(/</g, "&lt;")}</span>`);
      a.setAttribute("aria-hidden", "true"); b.setAttribute("aria-hidden", "true");
      const sa = new SplitText(a, { type: "chars", charsClass: "wow-ch", aria: "none" }), sb = new SplitText(b, { type: "chars", charsClass: "wow-ch", aria: "none" });
      gsap.set(el, { perspective: 400 });
      gsap.set(sb.chars, { opacity: 0, x: "-0.4em", yPercent: 25, rotateY: 90 });
      const st = 0.025;
      const on = () => { gsap.to(sa.chars, { opacity: 0, x: "0.4em", yPercent: -25, rotateY: -90, duration: DUR.m, ease: EASE.out, stagger: st, overwrite: true });
        gsap.to(sb.chars, { opacity: 1, x: 0, yPercent: 0, rotateY: 0, duration: DUR.m, ease: EASE.out, delay: 0.2, stagger: st, overwrite: true });
        gsap.set(el, { "--ul-o": "right" }); gsap.to(el, { "--ul": 0, duration: DUR.m, ease: EASE.out, overwrite: "auto" }); };
      const off = () => { gsap.to(sa.chars, { opacity: 1, x: 0, yPercent: 0, rotateY: 0, duration: DUR.m, ease: EASE.out, delay: 0.2, stagger: st, overwrite: true });
        gsap.to(sb.chars, { opacity: 0, x: "-0.4em", yPercent: 25, rotateY: 90, duration: DUR.m, ease: EASE.out, stagger: st, overwrite: true });
        gsap.set(el, { "--ul-o": "left" }); gsap.to(el, { "--ul": 1, duration: DUR.m, ease: EASE.out, overwrite: "auto" }); };
      el.addEventListener("pointerenter", on); el.addEventListener("pointerleave", off);
      el.addEventListener("focus", on); el.addEventListener("blur", off);
    });

    // ring: <a data-wow-ring><svg><circle data-arc r=".."/></svg></a>.The arc grows from a
    // short tick (about 4% of the circumference) to a half circle on hover and focus.
    document.querySelectorAll("[data-wow-ring]").forEach(el => {
      const arcs = el.querySelectorAll("[data-arc]"); if (!arcs.length) return;
      const len = arcs[0].getTotalLength();
      gsap.set(arcs, { strokeDasharray: `${len * 0.0417} ${len}` });
      const tl = gsap.timeline({ paused: true }).to(arcs, { strokeDasharray: `${len / 2} ${len}`, duration: DUR.m, ease: EASE.inOut });
      el.addEventListener("pointerenter", () => tl.play()); el.addEventListener("pointerleave", () => tl.reverse());
      el.addEventListener("focus", () => tl.play()); el.addEventListener("blur", () => tl.reverse());
    });

    // floating tip: <div class="wow-tip" data-wow-tip="a">..</div> follows the cursor with a 2.4s lag while a
    // [data-wow-tip-for="a"] is hovered. It flips to the other side of the cursor near the viewport edge.
    // Decorative: whatever it says must also exist in the page as real text.
    const tips = new Map([...document.querySelectorAll("[data-wow-tip]")].map(t => [t.dataset.wowTip, t])), live = new Set();
    // target point: the cursor, moved to its other side when the tip would leave the viewport (CSS has a 16px margin)
    const spot = (t, x, y) => { const w = t.offsetWidth + 32, h = t.offsetHeight + 32, l = x + w > innerWidth, u = y + h > innerHeight;
      t.classList.toggle("is-left", l); t.classList.toggle("is-top", u); return { x: l ? x - w : x, y: u ? y - h : y }; };
    if (tips.size) {
      addEventListener("pointermove", e => live.forEach(t => gsap.to(t, { ...spot(t, e.clientX, e.clientY), duration: DUR.l * 2, ease: "power3.out", overwrite: "auto" })));
      document.querySelectorAll("[data-wow-tip-for]").forEach(trg => { const t = tips.get(trg.dataset.wowTipFor); if (!t) return;
        trg.addEventListener("pointerenter", e => { gsap.set(t, spot(t, e.clientX, e.clientY)); t.classList.add("is-active"); live.add(t); });
        trg.addEventListener("pointerleave", () => { t.classList.remove("is-active", "is-left", "is-top"); live.delete(t); }); });
    }
  }

  // ---------- chrome ----------
  const badge = document.querySelector("[data-wow-badge]");
  if (badge) {
    let rot = 0, speed = 12;
    gsap.ticker.add((t, dt) => { rot += speed * Math.min(dt, 100) / 1000; badge.style.transform = `rotate(${rot}deg)`; });
    const kick = v => { speed = Math.sign(v || 1) * (12 + 8 * Math.min(Math.abs(v), 40)); gsap.to({}, { duration: 0.6, onComplete: () => (speed = 12) }); };
    if (lenis) lenis.on("scroll", ({ velocity }) => kick(velocity));
    else { let last = scrollY; addEventListener("scroll", () => { kick((scrollY - last) / 4); last = scrollY; }, { passive: true }); }
  }
  const prog = document.querySelectorAll("[data-wow-progress]");
  if (prog.length) ScrollTrigger.create({ start: 0, end: "max", onUpdate: st => prog.forEach(p => p.style.setProperty("--p", st.progress.toFixed(4))) });

  // ---------- preloader: hold, then open a shape onto the hero ----------
  const release = () => held.forEach(f => f());
  if (loader) {
    lenis?.stop(); root.classList.add("wow-lock");
    // the loader is masked by a radial hole (--hole, see wow.css); growing the hole opens onto the hero
    let released = false;
    const go = () => { if (!released) { released = true; release(); } };
    const tl = gsap.timeline({ delay: 0.2, onComplete: () => { loader.remove(); root.classList.remove("wow-lock"); lenis?.start(); ScrollTrigger.refresh(); } });
    // budget ≤ 2.4s from load: in 0.6 + stagger 0.2 + hold 0.25 + hole 1.1 (+0.2 delay) ≈ 2.35s
    tl.from(loader.querySelectorAll("[data-wow-loader-in]"), { opacity: 0, y: 16, duration: 0.6, ease: EASE.out, stagger: 0.1 })
      .to({}, { duration: 0.25 })
      .to(loader.querySelectorAll("[data-wow-loader-in]"), { opacity: 0, duration: 0.3, ease: "power2.in" })
      .fromTo(loader, { "--hole": "0vmax" }, { "--hole": "120vmax", duration: 1.1, ease: EASE.inOut }, "<")
      .add(go, "-=0.7");
    // never trap the visitor: any input skips
    const skip = () => { tl.progress(1); go(); };
    ["wheel", "keydown", "touchstart", "pointerdown"].forEach(e => addEventListener(e, skip, { once: true, passive: true }));
  }

  addEventListener("load", () => ScrollTrigger.refresh());
})();
