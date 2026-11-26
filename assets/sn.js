/* SeniorNest rebuild runtime. Our own code; no Framer code runs on these pages.
   Drives: load-in animations, scroll reveals, scroll-linked transforms, recorded
   hover/tap/scroll states (morphed in place), tickers, slideshows, counters,
   video popup, forms. Data comes from <script type="application/json" id="sn-data">. */
(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('sn-data').textContent);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BP = () => innerWidth >= 1200 ? 'desktop' : innerWidth >= 810 ? 'tablet' : 'phone';
  const BPW = { desktop: 1440, tablet: 834, phone: 390 };
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden'; };
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const find = a => a && $$('.' + CSS.escape(a.k)).filter(vis)[a.i];

  /* ---------------------------------------------------------------- springs */
  const clamp = (a, b, v) => Math.min(b, Math.max(a, v));
  function findSpring(durS, bounce, mass = 1) {
    const safeMin = 0.001; let ratio = clamp(0.05, 1, 1 - bounce); const d = clamp(0.01, 10, durS);
    let env, der;
    const ang = (f, r) => f * Math.sqrt(1 - r * r);
    if (ratio < 1) {
      env = f => { const e = f * ratio, delta = e * d, a = e, b = ang(f, ratio), c = Math.exp(-delta); return safeMin - (a / b) * c; };
      der = f => { const e = f * ratio, delta = e * d, dd = 0, ee = ratio * ratio * f * f * d, ff = Math.exp(-delta), g = ang(f * f, ratio); const fac = -env(f) + safeMin > 0 ? -1 : 1; return fac * ((dd - ee) * ff) / g; };
    } else {
      env = f => -safeMin + Math.exp(-f * d) * (f * d + 1);
      der = f => Math.exp(-f * d) * (-f * d * d);
    }
    let f = 5 / d; for (let i = 1; i < 12; i++) f = f - env(f) / der(f);
    if (!isFinite(f)) return { stiffness: 100, damping: 10, mass };
    const stiffness = f * f * mass; return { stiffness, damping: ratio * 2 * Math.sqrt(mass * stiffness), mass };
  }
  const easeCache = new Map();
  function curve(t) {
    // -> {dur ms, easing css, delay ms}
    t = t || { type: 'spring', bounce: 0.2, duration: 0.4 };
    const delay = (t.delay || 0) * 1000;
    if (t.type === 'tween' || (t.type !== 'spring' && t.ease)) {
      const e = Array.isArray(t.ease) ? `cubic-bezier(${t.ease.join(',')})` : (t.ease || 'ease');
      return { dur: (t.duration ?? 0.3) * 1000, easing: e, delay };
    }
    let k, c, m = t.mass || 1;
    if (t.stiffness == null && t.damping == null && t.duration != null) ({ stiffness: k, damping: c } = findSpring(t.duration, t.bounce ?? 0.25, m));
    else { k = t.stiffness ?? 100; c = t.damping ?? 10; }
    const key = k.toFixed(3) + '|' + c.toFixed(3) + '|' + m;
    if (!easeCache.has(key)) {
      let x = 0, v = 0, time = 0; const dt = 1 / 1000, pts = [0]; let settled = 0;
      while (time < 10) {
        for (let i = 0; i < 10; i++) { const a = (-k * (x - 1) - c * v) / m; v += a * dt; x += v * dt; time += dt; }
        pts.push(x);
        if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01) { if (++settled > 2) break; } else settled = 0;
      }
      pts[pts.length - 1] = 1;
      const step = Math.max(1, Math.floor(pts.length / 120));
      const out = []; for (let i = 0; i < pts.length; i += step) out.push(+pts[i].toFixed(4) + ' ' + (i / (pts.length - 1) * 100).toFixed(2) + '%');
      if (!out[out.length - 1].endsWith(' 100.00%')) out.push('1 100%');
      easeCache.set(key, { dur: (pts.length - 1) * 10, easing: `linear(${out.join(',')})`, k, c, m });
    }
    const r = easeCache.get(key); return { dur: r.dur, easing: r.easing, delay, k: r.k, c: r.c, m: r.m };
  }
  const tf = s => { s = s || {}; const p = []; if (s.x) p.push(`translateX(${s.x}px)`); if (s.y) p.push(`translateY(${s.y}px)`);
    if (s.scale != null && s.scale !== 1) p.push(`scale(${s.scale})`); if (s.rotate) p.push(`rotate(${s.rotate}deg)`); return p.join(' ') || 'none'; };
  function play(el, from, to, t, done) {
    const c = curve(t);
    if (reduce) { apply(el, to); done && done(); return; }
    const kf = [{ opacity: from.opacity ?? 1, transform: tf(from) }, { opacity: to.opacity ?? 1, transform: tf(to) }];
    el.getAnimations().forEach(a => a.cancel());
    const an = el.animate(kf, { duration: Math.max(1, c.dur), easing: c.easing, delay: c.delay, fill: 'both' });
    an.onfinish = () => { apply(el, to); an.cancel(); done && done(); };
    return an;
  }
  function apply(el, s) { el.style.opacity = s.opacity ?? 1; el.style.transform = tf(s); }

  /* ------------------------------------------------------- load-in (appear) */
  function appear() {
    const bpHash = (D.breakpoints || []).find(b => matchMedia(b.mediaQuery).matches);
    $$('[data-framer-appear-id]').forEach(el => {
      if (!vis(el) && !el.closest('nav')) { /* hidden breakpoint copy */ }
      const cfg = (D.appear || {})[el.getAttribute('data-framer-appear-id')]; if (!cfg) return;
      const hashes = (D.breakpoints || []).filter(b => matchMedia(b.mediaQuery).matches).map(b => b.hash);
      const v = hashes.map(h => cfg[h]).find(Boolean) || cfg.default; if (!v) return;
      const { transition, ...to } = v.animate;
      play(el, v.initial, to, transition);
    });
  }

  /* ----------------------------------------------- scroll reveals (enter/exit) */
  function reveals() {
    const list = D.effects || [];
    const bp = BP();
    list.forEach(fx => {
      if (!fx.fx.animate || !fx.fx.enter) return;
      if ((fx.off || []).includes(bp)) return;
      $$('.' + CSS.escape(fx.cls)).forEach(el => {
        if (el.dataset.snRev) return; el.dataset.snRev = 1;
        const enter = fx.fx.enter, exit = fx.fx.exit, t = (fx.fx.animate || {}).transition, once = fx.fx.animateOnce !== false;
        apply(el, enter);
        let shown = false;
        const thr = fx.fx.threshold || 0;
        const io = new IntersectionObserver(es => es.forEach(e => {
          const r = e.target.getBoundingClientRect();
          const need = Math.min(thr, (innerHeight / Math.max(1, r.height)) * 0.99);
          const inView = e.isIntersecting && e.intersectionRatio >= need - 0.001;
          if (inView && !shown) { shown = true; play(el, enter, { opacity: 1 }, t); if (once) io.disconnect(); }
          else if (!e.isIntersecting && shown && !once) { shown = false; const ex = exit || enter; play(el, { opacity: 1 }, ex, ex.transition || t); }
        }), { threshold: [0, 0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
        // an element that starts offset inside a box that clips (stat labels under the numbers) never intersects on its own:
        // watch the nearest small clipping box instead, which is where it becomes visible
        let tgt = el;
        for (let a = el.parentElement, i = 0; a && i < 3; a = a.parentElement, i++) {
          const s = getComputedStyle(a);
          if (s.overflowY === 'visible') continue;
          const c = a.getBoundingClientRect(), r = el.getBoundingClientRect();
          if (c.height < innerHeight && (r.top >= c.bottom - 1 || r.bottom <= c.top + 1)) tgt = a;
          break;
        }
        io.observe(tgt);
      });
    });
  }

  /* ---------------------------------------------- scroll-linked transforms */
  const docTop = e => { let y = 0; while (e) { y += e.offsetTop; e = e.offsetParent; } return y; };
  const scrollFx = [];
  function scrollTransforms() {
    const bp = BP();
    const sameScope = (el, cls) => { const all = $$('.' + CSS.escape(cls)).filter(vis); return all[0] || null; };
    (D.effects || []).forEach(fx => {
      const tt = fx.fx.transformTargets; if (!tt || fx.fx.transformTrigger !== 'onScrollTarget' || !fx.fx.styleTransformEffectEnabled) return;
      $$('.' + CSS.escape(fx.cls)).forEach(el => {
        if ((fx.off || []).includes(bp)) { el.style.transform = ''; el.style.opacity = ''; return; }
        const pts = tt.map(t => ({ t: t.target, ref: t.ref && (t.ref.self ? el : (t.ref.id && document.getElementById(t.ref.id)) || (t.ref.cls && sameScope(el, t.ref.cls))) }));
        scrollFx.push({ el, pts, thr: fx.fx.transformViewportThreshold || 0, spring: fx.fx.spring, cur: null, vel: {} });
      });
    });
    if (scrollFx.length) { addEventListener('scroll', tickScroll, { passive: true }); addEventListener('resize', tickScroll); tickScroll(); }
  }
  const KEYS = ['opacity', 'x', 'y', 'scale', 'rotate'];
  const DEF = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 };
  let springRaf = 0;
  function target(f) {
    // Framer: for each target with a ref, input = [top(ref) - 1 - thr*vh, + ref.clientHeight]
    const vh = innerHeight, y = scrollY, inR = [], outR = {};
    KEYS.forEach(k => outR[k] = []);
    let last;
    for (let i = f.pts.length - 1; i >= 0; i--) {
      const p = f.pts[i]; if (!p.ref || !vis(p.ref) && p.ref !== f.el) continue;
      const c = docTop(p.ref) - 1 - f.thr * vh, l = p.ref.clientHeight, d = Math.max(c + l, 0);
      inR.unshift(Math.max(c, 0), last === undefined ? d : Math.min(d, Math.max(last - 1, 0)));
      last = c;
      const prev = (f.pts[i - 1] || {}).t, cur = p.t;
      KEYS.forEach(k => outR[k].unshift(prev ? (prev[k] ?? DEF[k]) : DEF[k], cur[k] ?? DEF[k]));
    }
    if (!inR.length) return null;
    const o = {};
    KEYS.forEach(k => { const a = outR[k]; if (y <= inR[0]) o[k] = a[0]; else if (y >= inR[inR.length - 1]) o[k] = a[a.length - 1];
      else for (let i = 0; i < inR.length - 1; i++) if (y >= inR[i] && y <= inR[i + 1]) { const s = inR[i + 1] - inR[i]; o[k] = s ? a[i] + (a[i + 1] - a[i]) * (y - inR[i]) / s : a[i + 1]; break; } });
    return o;
  }
  function tickScroll() {
    scrollFx.forEach(f => { f.goal = target(f); if (!f.goal) return; if (!f.spring || !f.cur) { f.cur = { ...f.goal }; render(f); } });
    if (scrollFx.some(f => f.spring && f.goal) && !springRaf) springRaf = requestAnimationFrame(stepSprings);
  }
  let lastT = 0;
  function stepSprings(t) {
    const dt = Math.min(0.064, lastT ? (t - lastT) / 1000 : 0.016); lastT = t; let moving = false;
    scrollFx.forEach(f => { if (!f.spring || !f.goal) return; const sp = curve(f.spring);
      KEYS.forEach(k => { const x = f.cur[k], g = f.goal[k]; let v = f.vel[k] || 0; const n = 8; for (let i = 0; i < n; i++) { const a = (-sp.k * (x - g) - sp.c * v) / sp.m; v += a * dt / n; f.cur[k] += v * dt / n; }
        f.vel[k] = v; if (Math.abs(f.cur[k] - g) > 0.01 || Math.abs(v) > 0.01) moving = true; else { f.cur[k] = g; f.vel[k] = 0; } });
      render(f); });
    springRaf = moving ? requestAnimationFrame(stepSprings) : 0; if (!moving) lastT = 0;
  }
  function render(f) { f.el.style.transform = tf(f.cur); f.el.style.opacity = f.cur.opacity; f.el.style.willChange = 'transform'; }

  /* ------------------------------------------------------- loops (rotate etc) */
  function loops() {
    (D.effects || []).forEach(fx => { if (!fx.fx.loopEffectEnabled || !fx.fx.loop) return;
      $$('.' + CSS.escape(fx.cls)).forEach(el => { const t = fx.fx.loopTransition || {}; const c = curve(t);
        el.animate([{ transform: 'rotate(0deg)' }, { transform: tf(fx.fx.loop) }], { duration: c.dur, easing: c.easing, iterations: Infinity }); }); });
  }

  /* ------------------------------------------------------- recorded states */
  const ST = () => (D.states || {})[BP()] || {};
  const tpl = document.createElement('template');
  const keyOf = n => { if (n.nodeType !== 1) return '#' + n.nodeType; const c = (n.getAttribute('class') || '').split(/\s+/).filter(k => /^framer-[a-z0-9]+$/.test(k) && !k.startsWith('framer-v-') && k !== 'framer-text' && k !== 'framer-image'); return n.tagName + '.' + (c[c.length - 1] || ''); };
  const KEEP = new Set(['src', 'srcset', 'href', 'alt', 'sizes']);
  function patch(a, b, keepText) {
    if (a.nodeType === 3) { if (!keepText && a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    if (a.nodeType !== 1) return;
    for (const at of [...b.attributes]) { if (keepText && KEEP.has(at.name)) continue; if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value); }
    for (const at of [...a.attributes]) { if (keepText && KEEP.has(at.name)) continue; if (!b.hasAttribute(at.name) && !at.name.startsWith('data-sn')) a.removeAttribute(at.name); }
    const ac = [...a.childNodes].filter(n => n.nodeType === 1 || n.nodeType === 3), bc = [...b.childNodes].filter(n => n.nodeType === 1 || n.nodeType === 3);
    const used = new Set(); const order = [];
    bc.forEach((bn, i) => { const k = keyOf(bn); let m = ac.find((an, j) => !used.has(an) && keyOf(an) === k && (bn.nodeType === 1 || j === i));
      if (!m && bn.nodeType === 3) m = ac.find(an => !used.has(an) && an.nodeType === 3);
      if (m) { used.add(m); patch(m, bn, keepText); order.push(m); } else { const nn = document.importNode(bn, true); if (nn.nodeType === 1) nn.dataset.snNew = 1; order.push(nn); } });
    ac.forEach(an => { if (!used.has(an)) an.remove(); });
    order.forEach((n, i) => { if (a.childNodes[i] !== n) a.insertBefore(n, a.childNodes[i] || null); });
  }
  const TRANS = curve({ type: 'spring', bounce: 0.2, duration: 0.4 });
  function morph(el, html, keepText) {
    if (!el || !html) return;
    tpl.innerHTML = html.trim(); const nw = tpl.content.firstElementChild; if (!nw) return;
    const h0 = el.getBoundingClientRect().height;
    el.classList.add('sn-tr');
    patch(el, nw, keepText);
    el.classList.add('sn-tr');
    $$('[data-sn-new]', el).forEach(n => { delete n.dataset.snNew; if (!reduce) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' }); });
    const h1 = el.getBoundingClientRect().height;
    if (!reduce && Math.abs(h1 - h0) > 2 && getComputedStyle(el).position !== 'absolute') {
      const ov = el.style.overflow; el.style.overflow = 'clip';
      el.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: TRANS.dur, easing: TRANS.easing }).onfinish = () => { el.style.overflow = ov; };
    }
    clearTimeout(el._snT); el._snT = setTimeout(() => el.classList.remove('sn-tr'), TRANS.dur + 50);
    bindStates(el);
  }

  // hover by component type: scope|variant on the root
  const typeKey = e => { const ks = (e.getAttribute('class') || '').split(/\s+/); const s = ks.find(x => /^framer-[A-Za-z0-9]{5}$/.test(x)); const v = ks.find(x => x.startsWith('framer-v-')); return s && v ? s + '|' + v : null; };
  function bindStates(scope) {
    const st = ST();
    const hov = st.hover || {};
    $$('[class*="framer-v-"]', scope).concat(scope.matches && scope.matches('[class*="framer-v-"]') ? [scope] : []).forEach(el => {
      if (el._snH) return;
      const t = typeKey(el); const rec = t && hov[t]; if (!rec) return;
      el._snH = 1;
      el.addEventListener('mouseenter', () => { if (el._snHover) return; el._snHover = 1; el._snRest = el.outerHTML; morph(el, rec.hover, true); el._snH = 1; });
      el.addEventListener('mouseleave', () => { if (!el._snHover) return; el._snHover = 0; morph(el, el._snRest, false); el._snH = 1; });
    });
  }
  function bindInstanceStates() {
    const st = ST();
    (st.hover_inst || []).forEach(h => {
      const t = find(h.trigger); if (!t || t._snHI) return; t._snHI = 1;
      t.addEventListener('mouseenter', () => h.changes.forEach(c => morph(find(c.a), c.hover)));
      t.addEventListener('mouseleave', () => h.changes.forEach(c => { const e = find(c.a); if (e) morph(e, c.rest); }));
    });
    // taps: per trigger, [first state, state after a second press]
    const taps = st.tap || [];
    taps.forEach(tp => tp._k = tp.trigger.k + ':' + tp.trigger.i);
    document.addEventListener('click', ev => {
      const st2 = ST(); const list = st2.tap || []; if (!list.length) return;
      for (let tp of list) {
        const t = find(tp.trigger); if (!t || !t.contains(ev.target)) continue;
        ev.preventDefault();
        // the recorder also catches auto-playing sliders elsewhere on the page: keep only the roots around this trigger
        const own = c => { const e = find(c.a); return e && e.contains(t); };
        tp = Object.assign({}, tp, { first: tp.first.filter(own), second: (tp.second || []).filter(own) });
        if (!tp.first.length) return;
        const roots = tp.first.map(c => find(c.a));
        const cur = roots[0] && roots[0]._snState;
        const goSecond = tp.second && tp.second.length && cur === tp._k + ':1';
        const set = goSecond ? tp.second : tp.first;
        set.forEach((c, i) => morph(find(c.a), c.html));
        (goSecond ? tp.second : tp.first).forEach(c => { const e = find(c.a); if (e) { e._snState = goSecond ? null : tp._k + ':1'; if (goSecond) e._snScroll = null; } });
        if (goSecond) setTimeout(() => dispatchEvent(new Event('scroll')), 30);
        return;
      }
      // a trigger with no recording (e.g. the tab already active at rest): go back to rest
      for (const tp of list) for (const c of tp.first) {
        const root = find(c.a); if (!root || !root.contains(ev.target)) continue;
        const pressable = ev.target.closest('[style*="cursor"],[class*="framer-"]');
        if (root._snState && pressable && !list.some(x => { const tt = find(x.trigger); return tt && tt.contains(ev.target); })) {
          // only for elements that look pressable (cursor:pointer)
          let p = ev.target; while (p && p !== root && getComputedStyle(p).cursor !== 'pointer') p = p.parentElement;
          if (p && p !== root) { morph(root, c.rest); root._snState = null; return; }
        }
      }
    }, true);
    // nav look by scroll
    const navs = st.scroll || [];
    if (navs.length) {
      const on = () => navs.forEach(n => { const e = find(n.a); if (!e) return; const want = scrollY > 50 ? 'scrolled' : 'top'; if (e._snScroll !== want && !e._snState) { e._snScroll = want; morph(e, n[want]); } });
      addEventListener('scroll', on, { passive: true }); on();
    }
  }

  /* ------------------------------------------- text effects (line by line, blur up) */
  // Booking widget: the template keeps the picked date and the picked time independently (recorded states are whole-widget
  // snapshots, so they cannot combine them). Same tokens as the template's Selected cells.
  function booking() {
    const TK = { dateBg: 'var(--token-57839b25-cc93-4ce0-95f5-f2666d8c5df9)', timeBg: 'var(--token-f3e81d5d-5f00-4667-aa04-a6f05bf90bd5)',
                 light: 'var(--token-25f21b71-5737-491a-9b12-44cf32d6e445)', dark: 'var(--token-f3e81d5d-5f00-4667-aa04-a6f05bf90bd5)' };
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    $$('[data-framer-name="Widget / Booking"]').forEach(w => {
      const cells = [...w.querySelectorAll('[data-framer-name="Frame"][data-highlight], [data-framer-name="Selected"]')]
        .map(el => { const p = el.querySelector('p'); const t = p ? p.textContent.trim() : '';
          return { el, p, txt: p && p.parentElement, t, kind: /^\d{1,2}$/.test(t) ? 'date' : /^\d\d:\d\d$/.test(t) ? 'time' : null,
                   on: el.getAttribute('data-framer-name') === 'Selected' }; })
        .filter(c => c.kind);
      if (!cells.length) return;
      const ps = [...w.querySelectorAll('p')];
      const vDate = ps.find(p => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} Oct$/.test(p.textContent.trim()));
      const vTime = ps.find(p => /^\d\d:\d\d$/.test(p.textContent.trim()) && !cells.some(c => c.p === p));
      const look = (c, on) => {
        c.on = on; c.el.style.transition = 'background-color .25s ease';
        c.el.style.backgroundColor = on ? (c.kind === 'date' ? TK.dateBg : TK.timeBg) : (c.kind === 'time' ? TK.light : 'transparent');
        if (c.kind === 'date' && !on) c.el.style.borderRadius = '12px';
        c.txt.style.setProperty('--extracted-r6o4lv', on ? TK.light : TK.dark);
      };
      addEventListener('click', ev => {
        if (!w.contains(ev.target)) return;
        const c = cells.find(x => x.el.contains(ev.target)); if (!c) return;
        ev.preventDefault(); ev.stopImmediatePropagation();
        if (c.on) return;
        cells.filter(x => x.kind === c.kind && x.on).forEach(x => look(x, false)); look(c, true);
        if (c.kind === 'date' && vDate) vDate.textContent = DAYS[new Date(2026, 9, +c.t).getDay()] + ' ' + c.t + ' Oct';
        if (c.kind === 'time' && vTime) vTime.textContent = c.t;
      }, true);
    });
  }

  // Framer scrollDirection effect on the nav wrap: scrolling down past 8px hides it (y -110, opacity 0), scrolling up shows it.
  function navHide() {
    const sel = ".framer-10h2lf4,.framer-o6pofs,.framer-1jr5t5l,.framer-8w0s9p,.framer-uihcyb,.framer-vvzo2i,.framer-e3fx8p,.framer-1yi4fia,.framer-dddtjj,.framer-12kehx6,.framer-fcgnpv,.framer-1dtkg9y";
    const els = [...document.querySelectorAll(sel)].filter(e => e.getAttribute("data-framer-name") === "Nav wrap");
    if (!els.length) return;
    const ease = "cubic-bezier(.76,0,.24,1)";
    let last = scrollY, hidden = false;
    const set = h => {
      if (h === hidden) return; hidden = h;
      for (const e of els) {
        e.style.transition = `transform .45s ${ease}, opacity .45s ${ease}`;
        e.style.transform = h ? "translateY(-110px)" : "none";
        e.style.opacity = h ? "0" : "1";
      }
    };
    addEventListener("scroll", () => {
      const y = scrollY, d = y - last;
      if (Math.abs(d) < 8) return;
      set(d > 0 && y > 0);
      last = y;
    }, { passive: true });
  }

  function textFx() {
    const chars = $$('span[style*="inline-block"][style*="filter"]').filter(s => /blur/.test(s.style.filter) && parseFloat(s.style.opacity) < 0.05);
    const groups = new Map();
    chars.forEach(s => { const c = s.closest('[data-framer-component-type="RichTextContainer"]') || s.parentElement; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(s); });
    let mountIdx = 0;
    const ease = 'cubic-bezier(.65,0,.35,1)';
    groups.forEach((spans, box) => {
      const y = parseFloat((spans[0].style.transform.match(/translateY\(([-\d.]+)px\)/) || [0, 24])[1]);
      const mount = y >= 40;
      const dur = mount ? 880 : 720;
      const start = mount ? 150 + 100 * (mountIdx++) : 0;
      const run = () => {
        const lines = []; let lastTop = null;
        spans.forEach(s => { const t = Math.round(s.getBoundingClientRect().top); if (lastTop === null || Math.abs(t - lastTop) > 4) { lines.push([]); lastTop = t; } lines[lines.length - 1].push(s); });
        lines.forEach((line, i) => line.forEach(s => {
          if (reduce) { s.style.opacity = 1; s.style.filter = 'none'; s.style.transform = 'none'; return; }
          const a = s.animate([{ opacity: 0.001, filter: 'blur(8px)', transform: `translateY(${y}px)` }, { opacity: 1, filter: 'blur(0px)', transform: 'none' }],
            { duration: dur, easing: ease, delay: start + i * 50, fill: 'both' });
          a.onfinish = () => { s.style.opacity = 1; s.style.filter = 'none'; s.style.transform = 'none'; a.cancel(); };
        }));
      };
      if (mount) { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(run); }
      else { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); run(); } }, { threshold: 0.1 }); io.observe(box); }
    });
  }

  /* ------------------------------------------- nav dropdowns (portal layer) */
  function portals() {
    const box = document.getElementById('template-overlay'); if (!box) return;
    let closeT = 0, cur = null;
    const place = (t) => { const root = box.firstElementChild; if (!root) return; const r = t.getBoundingClientRect();
      root.style.left = (r.left + r.width / 2 - root.getBoundingClientRect().width / 2 + scrollX) + 'px'; root.style.top = (r.bottom + scrollY) + 'px'; };
    const open = (p, t) => { clearTimeout(closeT); if (cur === p) return; cur = p; box.innerHTML = p.html; place(t);
      const panel = box.querySelector('[role="dialog"]') || box.firstElementChild;
      if (panel && !reduce) panel.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: TRANS.dur, easing: TRANS.easing }); };
    const close = () => { clearTimeout(closeT); closeT = setTimeout(() => { cur = null; box.innerHTML = ''; }, 140); };
    (D.portals || []).forEach(p => { const t = find(p.trigger); if (!t || t._snP) return; t._snP = 1;
      t.addEventListener('mouseenter', () => open(p, t)); t.addEventListener('mouseleave', close); });
    box.addEventListener('mouseenter', () => clearTimeout(closeT)); box.addEventListener('mouseleave', close);
  }

  /* ------------------------------------------------------------------ tickers */
  function tickers() {
    $$('section[style*="mask-image"] > ul, section[style*="overflow:hidden"] > ul').forEach(ul => {
      const sec = ul.parentElement; if (sec.closest('.framer-slideshow')) return;
      const cfg = (D.tickers || []).find(t => ul.closest('.' + t.container)) || { speed: 50, hover: null };
      sec.style.opacity = 1;
      const items = [...ul.children];
      const gap = parseFloat(getComputedStyle(ul).columnGap || getComputedStyle(ul).gap) || 0;
      let setW = 0;
      const fill = () => { setW = items.reduce((s, li) => s + li.getBoundingClientRect().width, 0) + gap * items.length;
        let total = ul.scrollWidth; let guard = 0; while (total < sec.clientWidth + setW && guard++ < 20) { items.forEach(li => { const c = li.cloneNode(true); c.setAttribute('aria-hidden', 'true'); ul.appendChild(c); }); total = ul.scrollWidth; } };
      fill();
      let x = 0, speed = cfg.speed, last = 0, hovering = false, inView = true;
      const host = cfg.hoverHost ? sec.closest('.' + cfg.hoverHost) || sec : sec;
      if (cfg.hover != null) { host.addEventListener('mouseenter', () => hovering = true); host.addEventListener('mouseleave', () => setTimeout(() => hovering = false, 100)); }
      new IntersectionObserver(es => inView = es[0].isIntersecting).observe(sec);
      const step = t => { const dt = last ? (t - last) / 1000 : 0; last = t;
        const sp = hovering && cfg.hover != null ? cfg.hover : (cfg.hover != null && cfg.hoverFactor == null ? cfg.speed : speed * (hovering ? (cfg.hoverFactor ?? 1) : 1));
        if (inView && !reduce) { x -= sp * dt; if (setW && -x >= setW) x += setW; ul.style.transform = `translateX(${x}px)`; }
        requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  /* --------------------------------------------------------------- slideshows */
  function slideshows() {
    $$('section.framer-slideshow').forEach(sec => {
      const ul = sec.querySelector('ul'); if (!ul) return;
      const cfg = (D.slides || []).find(s => sec.closest('.' + s.container)) || { itemAmount: 1, gap: 10, transition: { type: 'spring', stiffness: 200, damping: 40 } };
      const lis = [...ul.children]; const n = lis.length; if (n < 2) return;
      // loop: copies before and after
      lis.forEach(li => { const c = li.cloneNode(true); c.setAttribute('aria-hidden', 'true'); ul.appendChild(c); });
      lis.slice().reverse().forEach(li => { const c = li.cloneNode(true); c.setAttribute('aria-hidden', 'true'); ul.insertBefore(c, ul.firstChild); });
      let idx = n;
      const box = li => (li.getBoundingClientRect().width > 0 ? li : li.firstElementChild || li).getBoundingClientRect();
      const size = () => { const a = box(ul.children[0]), b = box(ul.children[1]); const d = b.left - a.left;
        return d > 1 ? d : a.width + (parseFloat(getComputedStyle(ul).gap) || 0); };
      const tr = curve(cfg.transition);
      let tries = 0;
      const go = (i, anim = true) => { idx = i; if (size() <= 1) { if (tries++ < 120) setTimeout(() => go(idx, false), 200); return; } ul.style.transition = anim && !reduce ? `transform ${tr.dur}ms ${tr.easing}` : 'none'; ul.style.transform = `translateX(${-idx * size()}px)`; };
      ul.addEventListener('transitionend', () => { if (idx >= 2 * n) go(idx - n, false); if (idx < n) go(idx + n, false); });
      go(idx, false);
      const ctl = sec.querySelector('fieldset > div'); if (ctl) ctl.style.opacity = 1;
      $$('button[aria-label="Previous"],button[aria-label="Next"]', sec).forEach(btn => {
        btn.disabled = false; btn.style.pointerEvents = 'auto'; btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => go(idx + (btn.getAttribute('aria-label') === 'Next' ? 1 : -1)));
      });
      if (cfg.drag) { let sx = null, base = 0;
        sec.addEventListener('pointerdown', e => { sx = e.clientX; base = -idx * size(); ul.style.transition = 'none'; });
        addEventListener('pointermove', e => { if (sx == null) return; ul.style.transform = `translateX(${base + e.clientX - sx}px)`; });
        addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; go(idx + (dx < -40 ? 1 : dx > 40 ? -1 : 0)); }); }
      addEventListener('resize', () => go(idx, false));
      addEventListener('load', () => go(idx, false));
      new ResizeObserver(() => go(idx, false)).observe(sec);
    });
  }

  /* ----------------------------------------------------------------- counters */
  function counters() {
    $$('[data-sn-count]').forEach(el => {
      const end = +el.dataset.snCount, start = +(el.dataset.snStart || 0); const pre = el.dataset.snPre || '', suf = el.dataset.snSuf || '';
      const fmt = v => pre + Math.round(v).toLocaleString('en-US') + suf;
      el.textContent = fmt(start);
      const c = curve({ type: 'spring', duration: 1, bounce: 0 });
      new IntersectionObserver((es) => es.forEach(e => { if (!e.isIntersecting) { el.textContent = fmt(start); return; }
        const t0 = performance.now(); const pts = c.easing.slice(7, -1).split(',').map(p => +p.trim().split(' ')[0]);
        const f = t => { const p = Math.min(1, (t - t0) / c.dur); const v = pts[Math.min(pts.length - 1, Math.floor(p * (pts.length - 1)))]; el.textContent = fmt(start + (end - start) * v); if (p < 1) requestAnimationFrame(f); };
        requestAnimationFrame(f); })).observe(el);
    });
  }

  /* ------------------------------------------------------------- video popup */
  function video() {
    $$('[data-sn-video]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', e => {
        e.preventDefault();
        const o = document.createElement('div'); o.className = 'sn-overlay';
        const src = el.dataset.snVideo;
        o.innerHTML = /\.mp4/.test(src) ? `<div class="sn-overlay__box"><video src="${src}" controls autoplay playsinline></video></div>` : `<div class="sn-overlay__box"><iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
        const close = () => { o.classList.remove('is-on'); setTimeout(() => o.remove(), 300); removeEventListener('keydown', esc); };
        const esc = k => { if (k.key === 'Escape') close(); };
        o.addEventListener('click', ev => { if (ev.target === o) close(); }); addEventListener('keydown', esc);
        document.body.appendChild(o); requestAnimationFrame(() => o.classList.add('is-on')); setTimeout(() => o.classList.add('is-on'), 30);
      });
    });
  }

  /* -------------------------------------------------------------------- forms */
  function forms() {
    $$('form').forEach(f => f.addEventListener('submit', e => {
      e.preventDefault();
      const b = f.querySelector('[type=submit]') || f.querySelector('button'); if (!b) return;
      const label = b.querySelector('p, span') || b; const old = label.textContent;
      label.textContent = 'Sending…';
      setTimeout(() => { label.textContent = f.dataset.snDone || 'Thank you, we will be in touch'; f.reset(); setTimeout(() => label.textContent = old, 4000); }, 900);
    }));
  }

  /* ------------------------------------------------------------- anchor links */
  function anchors() {
    document.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (!a) return; const id = a.getAttribute('href').slice(1); const t = id && document.getElementById(id);
      if (t) { e.preventDefault(); scrollTo({ top: docTop(t) - 20, behavior: 'smooth' }); } });
  }

  /* ------------------------------------------------ before / after compare */
  // The template's compare component, as it behaves live: once in view the line draws down, the labels fade in, then the
  // handle pops in; dragging or clicking anywhere moves the split, arrow keys nudge it.
  function compare() {
    $$('[role="slider"][aria-label*="efore"]').forEach(box => {
      if (box._snCmp) return; box._snCmp = 1;
      const k = [...box.children], clip = k[1], line = k[2], knob = k[3], labels = k.slice(4);
      if (!clip || !line || !knob) return;
      const E = 'cubic-bezier(.65,0,.35,1)';
      const set = p => {
        p = Math.max(0, Math.min(100, p));
        clip.style.clipPath = `inset(0 ${100 - p}% 0 0)`; line.style.left = knob.style.left = p + '%';
        box.setAttribute('aria-valuenow', Math.round(p));
      };
      const intro = () => {
        line.style.transition = `transform .7s ${E}`; line.style.transform = 'none';
        labels.forEach(l => { l.style.transition = 'opacity .5s ease'; l.style.opacity = 1; });
        setTimeout(() => { knob.style.transition = `opacity .45s ${E}, transform .45s ${E}`; knob.style.opacity = 1; knob.style.transform = 'none'; }, 200);
      };
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting && e.intersectionRatio >= .3)) { io.disconnect(); setTimeout(intro, 450); } }, { threshold: [0, .3, .6] });
      io.observe(box);
      const at = x => { const r = box.getBoundingClientRect(); return (x - r.left) / r.width * 100; };
      let drag = false;
      box.addEventListener('pointerdown', e => { drag = true; box.setPointerCapture(e.pointerId); set(at(e.clientX)); });
      box.addEventListener('pointermove', e => { if (drag) set(at(e.clientX)); });
      const end = () => { drag = false; };
      box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
      box.addEventListener('keydown', e => {
        const p = +box.getAttribute('aria-valuenow') || 50;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(p - 5); e.preventDefault(); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(p + 5); e.preventDefault(); }
      });
    });
  }

  /* ---------------------------------------------- room for Prata's descenders */
  // Prata's letters reach further below the line than the template's face; boxes that clip (reveal masks, stat boxes)
  // are sized to the template's text, so give each one just the extra room it needs, without moving anything around it.
  function glyphRoom() {
    // Where the letters' ink really reaches, from the font's own metrics: how far above the first line box and below the
    // last one (Prata's tall figures poke out of the top, its descenders out of the bottom).
    const ctx = document.createElement('canvas').getContext('2d');
    const ink = (h, cs) => {
      const fs = parseFloat(cs.fontSize), L = parseFloat(cs.lineHeight) || fs * 1.2;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
      const t = h.textContent.replace(/\s+/g, ' ').trim() || 'Hg', m = ctx.measureText(t), f = ctx.measureText('Hg');
      const fA = f.fontBoundingBoxAscent || fs * .9, fD = f.fontBoundingBoxDescent || fs * .25;
      const base = (L - (fA + fD)) / 2 + fA;                       // baseline, from the top of a line box
      return { up: Math.max(0, m.actualBoundingBoxAscent - base), down: Math.max(0, base + m.actualBoundingBoxDescent - L) };
    };
    // The room goes in a stylesheet keyed on the box's own class, not inline: recorded states (the step slider) rewrite
    // inline styles while they play and would wipe it.
    let sheet = document.getElementById('sn-room');
    const run = () => {
      if (!sheet) { sheet = document.createElement('style'); sheet.id = 'sn-room'; document.head.appendChild(sheet); }
      sheet.textContent = '';
      // 1) single-line labels that our longer words push past the edge of their card: let that one text box wrap
      //    (sliders and tickers run past the screen on purpose, so only boxes narrower than the screen count)
      const vw = innerWidth, wrap = new Set(), shrink = new Set();
      const key = e => [...e.classList].find(x => /^framer-(?!v-)[a-z0-9]+$/i.test(x) && x.length > 9);
      $$('[data-framer-component-type="RichTextContainer"]').forEach(c => {
        if (!c.offsetWidth || c.closest('[aria-label="Patient stories"],.framer-11252xg,[role="slider"],[data-framer-name*="Ticker"],nav')) return;
        const r = document.createRange(); r.selectNodeContents(c); const t = r.getBoundingClientRect(); if (!t.width) return;
        const chain = [];
        for (let a = c.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
          const s = getComputedStyle(a); const b = a.getBoundingClientRect();
          if (b.width >= vw * .85) break;
          if (s.overflowX !== 'visible' && (t.right > b.right + 1 || t.left < b.left - 1)) {
            if (key(c)) wrap.add(key(c));
            chain.forEach(x => key(x) && shrink.add(key(x)));    // the boxes between the text and its card shrink to the card
            break;
          }
          chain.push(a);
        }
      });
      // 2) rows of small tags ("Guided surgery", "Dynamic navigation") that run past their card: let the row wrap
      const rows = new Set();
      $$('[class*="framer-"]').forEach(r => {
        if (!r.offsetWidth || r.closest('[aria-label="Patient stories"],[role="slider"],[data-framer-name*="Ticker"],nav')) return;
        const s = getComputedStyle(r); if (s.display !== 'flex' || !s.flexDirection.startsWith('row') || s.flexWrap !== 'nowrap') return;
        const b = r.getBoundingClientRect(); if (b.width >= vw * .85 || b.height > 80) return;
        const kids = [...r.children].filter(k => k.getBoundingClientRect().width); if (kids.length < 2) return;
        if (kids.some(k => k.getBoundingClientRect().height > 80)) return;
        if (kids.some(k => k.getAttribute('data-framer-component-type') === 'RichTextContainer')) return;   // icon + text rows wrap their text instead
        const box = r.parentElement && r.parentElement.getBoundingClientRect();
        const right = Math.max(...kids.map(k => k.getBoundingClientRect().right));
        if (right > Math.min(b.right, box ? box.right : b.right) + 1) {
          const cls = [...r.classList].find(x => /^framer-(?!v-)[a-z0-9]+$/i.test(x) && x.length > 9); if (cls) rows.add(cls);
        }
      });
      const wrapCss = [...rows].map(c => `.${c}{flex-wrap:wrap!important;row-gap:8px!important;height:auto!important}`)
        .concat([...shrink].map(c => `.${c}{width:auto!important;max-width:100%!important;min-width:0!important;flex-shrink:1!important}`)).concat([...wrap].map(c => `.${c}{white-space:normal!important;width:auto!important;max-width:100%!important;min-width:0!important;flex-shrink:1!important}.${c} .framer-text{white-space:normal!important}`)).join('\n');
      sheet.textContent = wrapCss;
      const need = new Map();
      $$('h1,h2,h3,h4,h5,h6,p').forEach(h => {
        const cs = getComputedStyle(h); if (!/Prata/.test(cs.fontFamily) || !h.offsetHeight) return;
        if (parseFloat(cs.fontSize) < 16) return;
        const e = ink(h, cs); if (e.up < .5 && e.down < .5) return;
        const ht = docTop(h), hb = ht + h.offsetHeight;
        for (let a = h.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
          const s = getComputedStyle(a); if (s.overflowY === 'visible' && s.overflowX === 'visible') continue;
          const at = docTop(a), ab = at + a.offsetHeight;
          const n = need.get(a) || { t: 0, b: 0 };
          n.t = Math.max(n.t, Math.ceil(at - (ht - e.up - 2))); n.b = Math.max(n.b, Math.ceil(hb + e.down + 2 - ab));
          need.set(a, n); break;
        }
      });
      const rules = new Map();   // class -> the largest room any of its boxes needs
      need.forEach((n, a) => {
        if (n.t <= 0 && n.b <= 0) return;
        const cls = [...a.classList].find(c => /^framer-(?!v-)[a-z0-9]+$/i.test(c) && c.length > 9); if (!cls) return;
        const r = rules.get(cls) || { t: 0, b: 0, s: getComputedStyle(a), h: a.offsetHeight, el: a };
        r.t = Math.max(r.t, n.t); r.b = Math.max(r.b, n.b); rules.set(cls, r);
      });
      const pad = (cls, r) => {
        const t = Math.max(0, r.t), b = Math.max(0, r.b), s = r.s, p = [];
        if (t) p.push(`padding-top:${(parseFloat(s.paddingTop) || 0) + t}px`, `margin-top:${(parseFloat(s.marginTop) || 0) - t}px`);
        if (b) p.push(`padding-bottom:${(parseFloat(s.paddingBottom) || 0) + b}px`, `margin-bottom:${(parseFloat(s.marginBottom) || 0) - b}px`);
        return p;
      };
      const write = fixed => {
        let css = '';
        rules.forEach((r, cls) => {
          const p = pad(cls, r);
          if (fixed.has(cls)) p.push(`height:${r.h + Math.max(0, r.t) + Math.max(0, r.b)}px`);   // a fixed-height box: grow it by the same room
          css += `.${cls}{${p.map(x => x + ' !important').join(';')}}\n`;
        });
        sheet.textContent = wrapCss + '\n' + css;
      };
      write(new Set());
      const fixed = new Set();
      rules.forEach((r, cls) => { if (r.el.offsetHeight < r.h + Math.max(0, r.t) + Math.max(0, r.b) - 0.5) fixed.add(cls); });
      if (fixed.size) write(fixed);
    };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { run(); setTimeout(run, 400); });
    let bp = BP(); addEventListener('resize', () => { if (BP() !== bp) { bp = BP(); setTimeout(run, 100); } });
  }

  /* ---------------------------------------------------------------------- go */
  function init() {
    document.documentElement.style.setProperty('--sn-d', TRANS.dur + 'ms'); document.documentElement.style.setProperty('--sn-e', TRANS.easing);
    window.__snErr = [];
    [appear, reveals, glyphRoom, compare, scrollTransforms, loops, () => bindStates(document.body), bindInstanceStates, portals, textFx, navHide, booking, tickers, slideshows, counters, video, forms, anchors]
      .forEach(f => { try { f(); } catch (e) { window.__snErr.push((f.name || 'step') + ': ' + e.message); console.error(e); } });
    let bp = BP(); addEventListener('resize', () => { if (BP() !== bp) { bp = BP(); $$('[class*="framer-v-"]').forEach(e => e._snH = 0); bindStates(document.body); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
