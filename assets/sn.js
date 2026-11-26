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
          else if (!e.isIntersecting && shown && !once && e.boundingClientRect.top > 0) { /* replays when scrolled back above it (as live) */ shown = false; const ex = exit || enter; play(el, { opacity: 1 }, ex, ex.transition || t); }
        }), { threshold: [0, 0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
        // an element that starts offset inside a box that clips (stat labels under the numbers) never intersects on its own:
        // watch the nearest small clipping box instead, which is where it becomes visible
        let tgt = el;
        for (let a = el.parentElement, i = 0; a && i < 3; a = a.parentElement, i++) {
          const s = getComputedStyle(a);
          if (s.overflowY === 'visible' || s.display === 'contents') continue;
          if (a.getBoundingClientRect().height < 2) continue;   // zero-height wrappers (Healcure's page shell) clip nothing visible
          const c = a.getBoundingClientRect(), r = el.getBoundingClientRect();
          if (c.height < innerHeight && (r.top >= c.bottom - 1 || r.bottom <= c.top + 1)) tgt = a;
          break;
        }
        io.observe(tgt);
      });
    });
  }
  // elements a shared component fades in (Healcure's footer) are not in the page modules' data: any block the server
  // left at opacity 0 with an offset gets the same fade-up when it scrolls into view
  function revealsFallback() {
    $$('[style*="opacity:0"][style*="transform"], [style*="opacity: 0"][style*="transform"]').forEach(el => {
      if (el.dataset.snRev || el.closest('[data-framer-component-type="RichTextContainer"]') || parseFloat(el.style.opacity) > 0.05) return;
      if (!/translate|scale/.test(el.style.transform) || el.closest('[aria-hidden="true"]')) return;
      el.dataset.snRev = 1;
      const io = new IntersectionObserver(es => { if (!es.some(e => e.isIntersecting)) return; io.disconnect();
        const from = { opacity: 0, transform: el.style.transform };
        if (reduce) { el.style.opacity = 1; el.style.transform = 'none'; return; }
        const an = el.animate([from, { opacity: 1, transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
        an.onfinish = () => { el.style.opacity = 1; el.style.transform = 'none'; an.cancel(); };
      }, { threshold: 0.05 });
      io.observe(el);
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
      if (el._snH || el.closest('.framer-mAPkR')) return;   // FAQ items: faq() owns them (a hover snapshot would undo an open item)
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
      // a real link always goes where it points: the recorder also logged some link wrappers (the phone menu's items)
      // as taps, and replaying those cancelled the page change (27 Nov: "I can't click the other headers on mobile")
      const link = ev.target.closest && ev.target.closest('a[href]');
      if (link) { const hr = link.getAttribute('href') || ''; if (hr && !hr.startsWith('#') && !hr.startsWith('javascript')) return; }
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
      const on = () => navs.forEach(n => { const e = find(n.a); if (!e) return; const want = scrollY > (n.at || 50) ? 'scrolled' : 'top'; if (e._snScroll !== want && !e._snState) { e._snScroll = want; morph(e, n[want]); } });
      addEventListener('scroll', on, { passive: true }); on();
    }
  }

  /* ------------------------------------------- text effects (line by line, blur up) */
  // Booking widget: the template keeps the picked date and the picked time independently (recorded states are whole-widget
  // snapshots, so they cannot combine them). Same tokens as the template's Selected cells.
  function booking() {
    // The template's calendar is a fixed October mock-up. Here it is a real one: it opens on this month, the arrows change
    // month, past days are greyed out and any day from today on can be picked (asked for 26 Nov). Times keep the
    // template's pills. "Contact our clinic" carries the chosen visit to the Contact page's message box.
    const TK = { brown: 'var(--token-57839b25-cc93-4ce0-95f5-f2666d8c5df9)', dark: 'var(--token-f3e81d5d-5f00-4667-aa04-a6f05bf90bd5)',
                 light: 'var(--token-25f21b71-5737-491a-9b12-44cf32d6e445)' };
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!document.getElementById('es-cal-css')) {
      const st = document.createElement('style'); st.id = 'es-cal-css';
      st.textContent = '.es-cal{display:grid;grid-template-columns:repeat(7,1fr);row-gap:2px;width:100%}'
        + '.es-day{all:unset;box-sizing:border-box;height:44px;display:flex;align-items:center;justify-content:center;border-radius:12px;cursor:pointer;'
        + 'color:' + TK.dark + ';transition:background-color .2s ease,color .2s ease;-webkit-tap-highlight-color:transparent}'
        + '.es-day:hover{background:rgba(134,85,67,.08)}.es-day:focus-visible{outline:2px solid ' + TK.brown + ';outline-offset:-2px}'
        + '.es-day.is-today{box-shadow:inset 0 0 0 1px ' + TK.brown + '}'
        + '.es-day.is-on{background:' + TK.brown + ';color:' + TK.light + ';box-shadow:none}'
        + '.es-day[disabled]{color:rgba(48,42,39,.28);cursor:default;background:none}.es-day.is-blank{visibility:hidden}'
        + '.es-cal-nav{position:absolute;top:0;bottom:0;width:50%;cursor:pointer;background:none;border:0;padding:0;z-index:2}'
        + '.es-cal-nav[disabled]{cursor:default}';
      document.head.appendChild(st);
    }
    $$('[data-framer-name="Widget / Booking"]').forEach(w => {
      if (w._esCal) return; w._esCal = 1;
      const cal = w.querySelector('[data-framer-name="Calendar"]'); if (!cal) return;
      const title = [...w.querySelectorAll('h4')].find(h => /^[A-Z][a-z]+ \d{4}$/.test(h.textContent.trim()));
      const ps = [...w.querySelectorAll('p')];
      const sample = ps.find(p => /^\d{1,2}$/.test(p.textContent.trim()) && cal.contains(p));
      const vDate = ps.find(p => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/.test(p.textContent.trim()));
      const times = [...w.querySelectorAll('[data-framer-name="Frame"][data-highlight], [data-framer-name="Selected"]')]
        .map(el => { const p = el.querySelector('p'); return { el, p, txt: p && p.parentElement, t: p ? p.textContent.trim() : '', on: el.getAttribute('data-framer-name') === 'Selected' }; })
        .filter(c => /^\d\d:\d\d$/.test(c.t) && !cal.contains(c.el));
      const vTime = ps.find(p => /^\d\d:\d\d$/.test(p.textContent.trim()) && !times.some(c => c.p === p));
      const cta = [...w.querySelectorAll('a')].find(a => /contact/i.test(a.getAttribute('href') || ''));
      const font = sample ? getComputedStyle(sample) : null;
      // hide the template's day rows (keep the weekday header); a stylesheet rule survives recorded states
      const calCls = [...cal.classList].find(c => /^framer-(?!v-)[a-z0-9]+$/.test(c));
      if (calCls) { const st = document.createElement('style'); st.textContent = '.' + calCls + ' > :not(:first-child):not(.es-cal){display:none!important}'; document.head.appendChild(st); }
      let view = new Date(today.getFullYear(), today.getMonth(), 1);
      let pick = new Date(today); pick.setDate(pick.getDate() + 1);
      let time = (times.find(c => c.on) || times[0] || {}).t || '';
      const maxView = new Date(today.getFullYear(), today.getMonth() + 12, 1);
      const grid = document.createElement('div'); grid.className = 'es-cal'; grid.setAttribute('role', 'grid');
      let prev = null, next = null;
      const visit = () => DAYS[pick.getDay()] + ' ' + pick.getDate() + ' ' + MONTHS[pick.getMonth()].slice(0, 3);
      const sync = () => {
        if (vDate) vDate.textContent = visit();
        if (vTime && time) vTime.textContent = time;
        if (cta) { const base = (cta.getAttribute('href') || '').split('?')[0];
          cta.setAttribute('href', base + '?visit=' + encodeURIComponent(visit() + ' ' + pick.getFullYear() + (time ? ', ' + time : ''))); }
      };
      const render = () => {
        if (title) title.textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
        grid.innerHTML = '';
        const lead = (view.getDay() + 6) % 7;                          // Monday first, like the template's header
        const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
        for (let i = 0; i < lead; i++) { const b = document.createElement('span'); b.className = 'es-day is-blank'; grid.appendChild(b); }
        for (let d = 1; d <= days; d++) {
          const dt = new Date(view.getFullYear(), view.getMonth(), d);
          const b = document.createElement('button'); b.type = 'button'; b.className = 'es-day'; b.textContent = d;
          if (font) { b.style.fontFamily = font.fontFamily; b.style.fontSize = font.fontSize; b.style.fontWeight = font.fontWeight; b.style.letterSpacing = font.letterSpacing; }
          b.setAttribute('aria-label', DAYS[dt.getDay()] + ' ' + d + ' ' + MONTHS[dt.getMonth()] + ' ' + dt.getFullYear());
          if (dt < today) b.disabled = true;
          if (+dt === +today) b.classList.add('is-today');
          if (+dt === +pick) { b.classList.add('is-on'); b.setAttribute('aria-selected', 'true'); }
          b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); pick = dt; render(); sync(); });
          grid.appendChild(b);
        }
        if (prev) prev.disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
        if (next) next.disabled = view >= maxView;
      };
      // the arrows are one drawing in the template: its left half goes back a month, its right half forward
      const tbox = title && title.closest('[data-framer-component-type="RichTextContainer"]');
      const arrows = tbox && tbox.nextElementSibling;
      if (arrows) {
        arrows.style.position = 'relative';
        prev = document.createElement('button'); prev.type = 'button'; prev.className = 'es-cal-nav'; prev.style.left = '0'; prev.setAttribute('aria-label', 'Previous month');
        next = document.createElement('button'); next.type = 'button'; next.className = 'es-cal-nav'; next.style.right = '0'; next.setAttribute('aria-label', 'Next month');
        prev.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (!prev.disabled) { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); } });
        next.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (!next.disabled) { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); } });
        arrows.append(prev, next);
      }
      cal.appendChild(grid); render(); sync();
      // recorded states can swap the calendar's children back: put the grid and arrow buttons back if they go
      new MutationObserver(() => {
        if (!cal.isConnected) return;
        if (!cal.contains(grid)) { cal.appendChild(grid); render(); }
        if (arrows && prev && !arrows.contains(prev)) arrows.append(prev, next);
      }).observe(w, { childList: true, subtree: true });
      // time pills
      const look = (c, on) => {
        c.on = on; c.el.style.transition = 'background-color .25s ease';
        c.el.style.backgroundColor = on ? TK.dark : TK.light;
        c.txt.style.setProperty('--extracted-r6o4lv', on ? TK.light : TK.dark);
      };
      addEventListener('click', ev => {
        if (!w.contains(ev.target)) return;
        const c = times.find(x => x.el.contains(ev.target)); if (!c) return;
        ev.preventDefault(); ev.stopImmediatePropagation();
        if (c.on) return;
        times.filter(x => x.on).forEach(x => look(x, false)); look(c, true); time = c.t; sync();
      }, true);
    });
    // Contact page: the visit chosen in the calendar lands in the message box (and the time-of-day select)
    const v = new URLSearchParams(location.search).get('visit');
    if (v) {
      $$('textarea').forEach(t => { if (!t.value) t.value = 'Preferred visit: ' + v + '.\n'; });
      const hr = +(v.match(/, (\d\d):/) || [])[1];
      if (hr) $$('select').forEach(sel => { const want = hr < 12 ? /morning/i : hr < 17 ? /afternoon/i : /evening/i;
        const o = [...sel.options].find(o => want.test(o.textContent)); if (o) sel.value = o.value; });
    }
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
    // Healcure: the hero heading appears word by word (blur 7px, y 10), its subheading letter by letter (y 7, no blur)
    const toks = $$('span[style*="inline-block"]').filter(s => parseFloat(s.style.opacity) < 0.05 && s.closest('[data-framer-component-type="RichTextContainer"]'));
    const groups = new Map();
    toks.forEach(s => { const c = s.closest('[data-framer-component-type="RichTextContainer"]'); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(s); });
    let mountIdx = 0;
    groups.forEach((spans, box) => {
      const y = parseFloat((spans[0].style.transform.match(/translateY\(([-\d.]+)px\)/) || [0, 10])[1]);
      const blur = (spans[0].style.filter.match(/blur\(([\d.]+)px\)/) || [0, 0])[1];
      const chars = spans.length > 1 && spans.every(s => s.textContent.length <= 1);
      const mount = box.getBoundingClientRect().top < innerHeight;
      const start = mount ? 200 + 250 * (mountIdx++) : 0;
      const run = () => spans.forEach((s, i) => {
        if (reduce) { s.style.opacity = 1; s.style.filter = 'none'; s.style.transform = 'none'; return; }
        const from = { opacity: 0.001, transform: `translateY(${y}px)` }; if (+blur) from.filter = `blur(${blur}px)`;
        const to = { opacity: 1, transform: 'none' }; if (+blur) to.filter = 'blur(0px)';
        const a = s.animate([from, to], { duration: chars ? 500 : 800, easing: 'cubic-bezier(.22,1,.36,1)', delay: start + i * (chars ? 8 : 70), fill: 'both' });
        a.onfinish = () => { s.style.opacity = 1; s.style.filter = 'none'; s.style.transform = 'none'; a.cancel(); };
      });
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

  /* ------------------------------------------------- reviews: auto-moving strip */
  // The patient stories strip glides right to left on its own, endlessly (asked for 26 Nov), and pauses under the pointer.
  // Driven by the Web Animations API so recorded hover states that rewrite inline styles can't stop it.
  function storyStrip() {
    $$('[role="region"][aria-label="Patient stories"]').forEach(reg => {
      const track = reg.firstElementChild; if (!track || track._snStrip) return; track._snStrip = 1;
      const start = () => {
        if (!reg.offsetWidth) return setTimeout(start, 500);
        const groups = [...track.children]; if (!groups.length) return;
        const gap = parseFloat(getComputedStyle(track).columnGap) || 16;
        const w = groups[0].getBoundingClientRect().width + gap; if (w < 50) return setTimeout(start, 500);
        // enough copies to always cover the screen while one set slides out
        while (track.scrollWidth < reg.clientWidth + w * 2) { const c = groups[0].cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.appendChild(c); }
        if (track._snAnim) track._snAnim.cancel();
        track._snAnim = track.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-w}px)` }],
          { duration: w / 45 * 1000, iterations: Infinity, easing: 'linear' });
        if (reduce) track._snAnim.pause();
      };
      start();
      reg.addEventListener('mouseenter', () => track._snAnim && track._snAnim.pause());
      reg.addEventListener('mouseleave', () => track._snAnim && !reduce && track._snAnim.play());
      let bp = BP(); addEventListener('resize', () => { if (BP() !== bp) { bp = BP(); setTimeout(start, 200); } });
    });
  }

  /* ------------------------------------------------------------------ tickers */
  function tickers() {
    $$('section[style*="mask-image"] > ul, section[style*="overflow:hidden"] > ul, ul[role="group"]:has(> li.ticker-item)').forEach(ul => {
      if (ul._snTick) return; ul._snTick = 1;
      const sec = ul.parentElement; if (sec.closest('.framer-slideshow')) return;
      const cfg = (D.tickers || []).find(t => ul.closest('.' + t.container)) || { speed: 50, hover: null };
      sec.style.opacity = 1;
      const items = [...ul.children];
      // About's clinic photos: two columns that drift vertically, the first up and the 'Secondary' one down, as on the
      // live template (~35px/s). Three copies of the photos, no more, so the column keeps its height.
      if (getComputedStyle(ul).flexDirection.startsWith('column')) {
        const gapY = parseFloat(getComputedStyle(ul).rowGap || getComputedStyle(ul).gap) || 0;
        for (let k = 0; k < 2; k++) items.forEach(li => { const c = li.cloneNode(true); c.setAttribute('aria-hidden', 'true'); ul.appendChild(c); });
        const down = !!ul.closest('[data-framer-name^="Secondary"]');
        let setH = 0; const measure = () => { setH = items.reduce((t, li) => t + li.getBoundingClientRect().height, 0) + gapY * items.length; };
        measure(); addEventListener('resize', measure); if (document.fonts) document.fonts.ready.then(measure);
        let y = down ? -setH : 0, last = 0, inView = true;
        new IntersectionObserver(es => inView = es[0].isIntersecting).observe(sec);
        const stepV = t => { const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
          if (inView && !reduce && setH) { y += (down ? 1 : -1) * 35 * dt; if (y <= -setH) y += setH; if (y > 0) y -= setH; ul.style.transform = `translateY(${y}px)`; }
          requestAnimationFrame(stepV); };
        requestAnimationFrame(stepV);
        return;
      }
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
    // The contact form goes to the clinic's WhatsApp (asked for 26 Nov): Send opens WhatsApp with every answer written out.
    const WA = '60198578829';
    const OPTS = {
      treatment: ['Dental implants', 'All-on-X / full arch', 'Digital dentistry', 'Clear aligners', 'Crowns & restorations', 'Scale & polish',
                  'Whitening', 'Fillings', 'Root canal', 'Periodontal care', 'Extractions', 'Dental assessment', 'Not sure yet'],
      day: ['Any day', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      time: ['Any time', 'Morning (9am–1pm)', 'Afternoon (2pm–5pm)'],
    };
    // v2 (Elqoriva) field names: full_name, email, phone, service, preferred_date, subject, message; the hidden honeypots reuse some names
    const LABEL = { Name: 'Name', full_name: 'Name', name: 'Name', 'Phone Number': 'Phone', Email: 'Email', Message: 'Message', phone: 'Phone', email: 'Email', service: 'Treatment', subject: 'Treatment', treatment: 'Treatment',
                    preferred_date: 'Preferred date', day: 'Preferred day', time: 'Preferred time', message: 'Message' };
    const nice = (k, v) => { if (k !== 'preferred_date' || !/^\d{4}-\d\d-\d\d$/.test(v)) return v;
      return new Date(v + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
    const today = new Date(); const iso = new Date(today - today.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    $$('input[type=date]').forEach(d => { if (!d.min) d.min = iso; });
    $$('form').forEach(f => {
      if (f._snForm) return; f._snForm = 1;
      // the template's dropdowns are buttons over a hidden input: lay a real <select> over each, same look
      $$('input[type=hidden]', f).forEach(h => {
        const btn = h.nextElementSibling; const opts = OPTS[h.name];
        if (!btn || btn.tagName !== 'BUTTON' || !opts) return;
        const span = btn.querySelector('span'); const placeholder = span ? span.textContent : '';
        const wrap = btn.parentElement; if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
        const sel = document.createElement('select'); sel.setAttribute('aria-label', placeholder);
        sel.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:16px;z-index:2';
        sel.innerHTML = '<option value="">' + placeholder + '</option>' + opts.map(o => '<option>' + o + '</option>').join('');
        btn.insertAdjacentElement('afterend', sel);
        // keep the select exactly over the button
        const place = () => { sel.style.inset = 'auto'; sel.style.left = btn.offsetLeft + 'px'; sel.style.top = btn.offsetTop + 'px'; sel.style.width = btn.offsetWidth + 'px'; sel.style.height = btn.offsetHeight + 'px'; };
        place(); addEventListener('resize', place);
        sel.addEventListener('change', () => { h.value = sel.value; if (span) span.textContent = sel.value || placeholder; });
        sel._snHidden = h; h._snSel = sel;
      });
      // a visit picked in the calendar: day and time of day follow it
      const v = new URLSearchParams(location.search).get('visit');
      if (v) {
        const day = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }[v.slice(0, 3)];
        const hr = +(v.match(/, (\d\d):/) || [])[1];
        const setSel = (name, val) => { const h = f.querySelector('input[type=hidden][name="' + name + '"]'); if (!h || !h._snSel || !val) return;
          h._snSel.value = val; h._snSel.dispatchEvent(new Event('change')); };
        setSel('day', day); if (hr) setSel('time', hr < 13 ? OPTS.time[1] : OPTS.time[2]);
        const t = f.querySelector('textarea'); if (t && !t.value) t.value = 'Preferred visit: ' + v + '.\n';
      }
      f.addEventListener('submit', e => {
        e.preventDefault();
        if (f.reportValidity && !f.reportValidity()) return;
        const lines = ['Hi Esteem Dental Clinic, I would like to arrange a visit.', ''], seen = new Set();
        for (const [k, label] of Object.entries(LABEL)) {
          const val = $$('[name="' + k + '"]', f).filter(el => el.getAttribute('aria-hidden') !== 'true').map(el => (el.tagName === 'SELECT' ? (el.value && el.selectedOptions[0] ? el.selectedOptions[0].text : '') : el.value || '').trim()).find(Boolean);
          if (val && !seen.has(label)) { seen.add(label); lines.push(label + ': ' + nice(k, val)); } }
        const url = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(lines.join('\n'));
        const win = window.open(url, '_blank', 'noopener');
        if (!win) location.href = url;
        const b = f.querySelector('[type=submit]') || f.querySelector('button:last-of-type');
        const label = b && (b.querySelector('p, span') || b);
        if (label) { const old = label.textContent; label.textContent = 'Opening WhatsApp…'; setTimeout(() => label.textContent = old, 3000); }
      });
    });
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
          if (b.width >= vw * .97) break;
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
        const b = r.getBoundingClientRect(); if (b.width >= vw * .97 || b.height > 80) return;
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


  /* ------------------------------------------------------------- v3 (Healcure) components */
  // About reel: three clinic photos cycle like the template's video reel (5 s each, progress bars, thumbnails, pause)
  function reel() {
    $$('img.es-reel').map(i => i.parentElement).filter((v, i, a) => a.indexOf(v) === i).forEach(box => {
      const slides = $$(':scope > img.es-reel', box); if (slides.length < 2) return;
      const btn = box.querySelector('button[aria-label]'); const thumbs = btn ? [...btn.nextElementSibling.children] : [];
      const bars = [...(box.lastElementChild ? box.lastElementChild.children : [])].map(b => b.firstElementChild).filter(Boolean);
      const DUR = 5000; let cur = 0, t0 = performance.now(), paused = false, pausedAt = 0;
      const show = i => { cur = i; t0 = performance.now(); slides.forEach((s, k) => { s.style.opacity = k === i ? 1 : 0; });
        thumbs.forEach((t, k) => t.style.border = k === i ? '2px solid #fff' : 'none'); bars.forEach((b, k) => { b.style.transition = 'none'; b.style.width = k < i ? '100%' : '0%'; }); };
      thumbs.forEach((t, k) => t.addEventListener('click', () => show(k)));
      if (btn) { const play = btn.innerHTML; btn.addEventListener('click', () => { paused = !paused;
        if (paused) { pausedAt = performance.now(); btn.setAttribute('aria-label', 'Play'); btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>'; }
        else { t0 += performance.now() - pausedAt; btn.setAttribute('aria-label', 'Pause'); btn.innerHTML = play; } }); }
      show(0);
      const tick = t => { if (!paused) { const p = Math.min(1, (t - t0) / DUR); if (bars[cur]) bars[cur].style.width = (p * 100) + '%';
          if (p >= 1 && !reduce) show((cur + 1) % slides.length); }
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }

  // Treatment pages: "On this page" lists the article's numbered sections (the template builds it at runtime) and marks the
  // one being read; the share buttons share this page
  function toc() {
    const frame = document.querySelector('[data-framer-name="Blog Content Frame"]'); if (!frame) return;
    const host = frame.querySelector('div > div') || frame;
    const heads = $$('[data-framer-name="content"] h3, [data-framer-name="content 1"] h3').filter(vis);
    if (!heads.length) return;
    host.innerHTML = '<ol class="es-toc">' + heads.map(h => '<li><a href="#' + h.id + '">' + h.textContent.trim() + '</a></li>').join('') + '</ol>';
    const links = $$('a', host);
    links.forEach((a, i) => a.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: heads[i].getBoundingClientRect().top + scrollY - 110, behavior: 'smooth' }); }));
    const mark = () => { let k = 0; heads.forEach((h, i) => { if (h.getBoundingClientRect().top < innerHeight * 0.35) k = i; }); links.forEach((a, i) => a.classList.toggle('is-on', i === k)); };
    addEventListener('scroll', mark, { passive: true }); mark();
    const u = encodeURIComponent(location.href), t = encodeURIComponent(document.title);
    $$('[data-framer-name="Social Media Icons"] a').forEach(a => {
      const h = a.getAttribute('href') || '';
      if (h.startsWith('mailto:')) a.href = 'mailto:?subject=' + t + '&body=' + u;
      else if (h.includes('twitter.com')) a.href = 'https://twitter.com/intent/tweet?text=' + t + '&url=' + u;
      else if (h.includes('whatsapp')) a.href = 'https://api.whatsapp.com/send?text=' + t + '%20' + u;
      else if (h.includes('facebook')) a.href = 'https://www.facebook.com/sharer/sharer.php?u=' + u;
      else if (h.includes('linkedin')) a.href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + u;
    });
  }

  // Our Expertise: "Show more treatments" reveals the three extra treatment cards, then goes away
  function showMore() {
    const more = $$('[data-es-more]'); if (!more.length) return;
    const btn = $$('a, button, [data-framer-name]').find(e => e.textContent.trim() === 'Show more treatments' && vis(e) && e.getBoundingClientRect().height < 80);
    if (!btn) return;
    const target = btn.closest('[class*="-container"]') || btn;
    target.addEventListener('click', e => { e.preventDefault();
      more.forEach((m, i) => { m.removeAttribute('data-es-more'); m.style.display = '';
        if (!reduce) m.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: i * 90, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }); });
      target.style.display = 'none'; }, { once: true });
  }


  // Phones and tablets: the template only stacks its service cards on desktop. Asked for the scroll effects on mobile too
  // (26 Nov): the six service cards stack as you scroll (the facility photos sit in two separate rows, so they keep their fade-up). A card taller than the screen sticks
  // only once its bottom is in view, so nothing on it is hidden; each sits a little above the next so an edge shows.
  function stackMobile() {
    const groups = [
      $$('[data-framer-name^="Service Card "]'),
    ].map(g => g.filter(e => !g.some(o => o !== e && o.contains(e))));   // the outer box of each card only
    const run = () => groups.forEach(all => {
      const cards = all.filter(vis);
      if (innerWidth >= 1200 || cards.length < 2) { cards.forEach(c => { if (c._snStk) { c.style.position = ''; c.style.top = ''; c.style.zIndex = ''; c.style.boxShadow = ''; c._snStk = 0; } }); return; }
      const base = 76;
      const t = cards.map((c, i) => Math.min(base + i * 10, innerHeight - c.offsetHeight - 16));
      for (let i = t.length - 2; i >= 0; i--) t[i] = Math.min(t[i], t[i + 1] - 8);
      cards.forEach((c, i) => { c._snStk = 1; c.style.position = 'sticky'; c.style.top = t[i] + 'px'; c.style.zIndex = i + 1;
        c.style.boxShadow = '0 -14px 40px -18px rgba(74, 51, 41, .28)'; });
    });
    run(); addEventListener('resize', run); if (document.fonts) document.fonts.ready.then(run); setTimeout(run, 1200);
  }


  // FAQ (Healcure): each question opens and closes on its own, as on the live template, and several can be open.
  // The recorder saw the whole list change on each press, so replaying it closed the others: here each item swaps only
  // itself between its closed look and its own open look (taken from that recording), and its height eases open.
  function faq() {
    const ITEM = '.framer-mAPkR';
    const allStates = D.states || {};
    const openHtml = new Map();   // breakpoint -> [open html per item index]
    Object.entries(allStates).forEach(([bp, st]) => {
      const list = st.tap || []; const arr = [];
      st.tap = list.filter(tp => {
        const own = (tp.first || []).find(c => /data-framer-name="FAQ"/.test(c.html.slice(0, 300)) && /framer-mAPkR/.test(c.html));
        if (!own) return true;
        const t = document.createElement('template'); t.innerHTML = own.html;
        const items = [...t.content.querySelectorAll(ITEM)];
        const opened = items.find(x => /Open/.test(x.getAttribute('data-framer-name') || ''));
        if (opened) arr[items.indexOf(opened)] = opened.outerHTML;
        return false;   // handled here
      });
      openHtml.set(bp, arr);
      // a hover recorded on a question redraws the whole list (closing the others): drop those
      st.hover_inst = (st.hover_inst || []).filter(hi => !(hi.changes || []).some(c => /framer-mAPkR/.test(c.hover || c.rest || '')));
    });
    $$(ITEM).forEach(el => {
      if (el._snFaq) return; el._snFaq = 1;
      el.style.cursor = 'pointer';
      if (el.parentElement && /-container/.test(el.parentElement.className)) el.parentElement.style.height = 'auto';   // the box grows with its question
      el.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        const item = ev.currentTarget;
        const sib = $$(ITEM, item.parentElement.closest('[data-framer-name="FAQ"]') || document).filter(vis);
        const i = sib.indexOf(item); const arr = openHtml.get(BP()) || [];
        const box = item.parentElement; const h0 = box.getBoundingClientRect().height;
        if (!item._snClosed) item._snClosed = item.outerHTML;
        const isOpen = item._snOpen;
        if (!isOpen && !arr[i]) return;
        morph(item, isOpen ? item._snClosed : arr[i]);
        item._snOpen = !isOpen;
        const h1 = box.getBoundingClientRect().height;
        if (!reduce && Math.abs(h1 - h0) > 2) {
          box.style.overflow = 'hidden';
          const a = box.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
          a.onfinish = () => { box.style.overflow = ''; box.style.height = 'auto'; };
          const ans = [...item.querySelectorAll('p')].slice(1);
          if (!isOpen) ans.forEach(p => p.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'ease-out' }));
        }
      }, true);
    });
  }

  /* ---------------------------------------------------------------------- go */
  /* ------------------------------------------------ v2 scroll motion (added 26 Nov) */
  // The Elqoriva template only fades blocks up. Asked for more life on scroll: headings rise in word by word, figures
  // count up, the home treatment list lights up row by row as it passes the middle of the screen, and the Our Expertise
  // treatment cards stack (CSS sticky, in mods.py). Opacity/transform only; nothing runs with reduced motion.
  function motion() {
    if (reduce) return;
    const E = 'cubic-bezier(.22,1,.36,1)';
    // 1. headings: words rise in, line by line
    const heads = $$('h1, h2').filter(h => parseFloat(getComputedStyle(h).fontSize) >= 28 && h.textContent.trim().length > 2 && !h.closest('footer, nav, [data-framer-name="Menu"]'));
    heads.forEach(h => {
      const words = [];
      const walk = n => [...n.childNodes].forEach(c => {
        if (c.nodeType === 3) {
          const parts = c.textContent.split(/(\s+)/); if (parts.length < 2 && !c.textContent.trim()) return;
          const frag = document.createDocumentFragment();
          parts.forEach(p => { if (!p) return; if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            const s = document.createElement('span'); s.textContent = p; s.style.display = 'inline-block'; s.style.opacity = 0; s.style.transform = 'translateY(.45em)'; frag.appendChild(s); words.push(s); });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
      });
      walk(h); if (!words.length) return;
      const run = () => {
        let line = -1, last = null;
        words.forEach((w, i) => {
          const t = Math.round(w.offsetTop); if (last === null || Math.abs(t - last) > 4) { line++; last = t; }
          const a = w.animate([{ opacity: 0, transform: 'translateY(.45em)' }, { opacity: 1, transform: 'none' }],
            { duration: 900, easing: E, delay: 120 + line * 110 + i * 35, fill: 'both' });
          a.onfinish = () => { w.style.opacity = 1; w.style.transform = 'none'; a.cancel(); };
        });
      };
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); (document.fonts ? document.fonts.ready : Promise.resolve()).then(run); } }, { threshold: 0.2 });
      io.observe(h);
    });
    // 2. figures count up when they come into view (247, 5, 4.9; not years or step numbers)
    $$('h2, h3, h4, p').filter(e => e.children.length <= 1 && parseFloat(getComputedStyle(e).fontSize) >= 24 && /^[1-9]\d{0,2}(\.\d)?(\/5)?$/.test(e.textContent.trim())).forEach(e => {
      const leaf = e.querySelector('span') || e; const txt = leaf.textContent.trim();
      const m = txt.match(/^(\d+(?:\.(\d))?)(.*)$/); const end = +m[1], dec = m[2] ? 1 : 0, suf = m[3];
      const fmt = v => v.toFixed(dec) + suf;
      leaf.textContent = fmt(0);
      const io = new IntersectionObserver(es => { if (!es.some(x => x.isIntersecting)) return; io.disconnect();
        const t0 = performance.now(), d = 1400;
        const f = t => { const p = Math.min(1, (t - t0) / d); leaf.textContent = fmt(end * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); else leaf.textContent = txt; };
        requestAnimationFrame(f); }, { threshold: 0.4 });
      io.observe(e);
    });
    // stacking cards taller than the screen (phones) stick only once their bottom is in view, so their buttons are reachable
    const stack = $$('[data-framer-name="Service Rows"] > [data-framer-name="Service Rows Item"]');
    if (stack.length) {
      const fit = () => {
        stack.forEach(c => c.style.removeProperty('top'));
        const base = stack.map(c => parseFloat(getComputedStyle(c).top) || 0);
        const t = stack.map((c, i) => Math.min(base[i], innerHeight - c.offsetHeight - 16));
        for (let i = t.length - 2; i >= 0; i--) t[i] = Math.min(t[i], t[i + 1] - 8);  // each card sits above the next: an edge of it stays visible
        stack.forEach((c, i) => { if (t[i] !== base[i]) c.style.setProperty('top', t[i] + 'px', 'important'); });
      };
      fit(); addEventListener('resize', fit); if (document.fonts) document.fonts.ready.then(fit);
    }
    // 3. home treatment list: each row is brightest as it crosses the middle of the screen
    const rows = $$('[data-framer-name="Service List Item"]');
    if (rows.length) {
      let ticking = false;
      const tick = () => { ticking = false; const mid = innerHeight * 0.5;
        const vals = rows.map(r => { const b = r.getBoundingClientRect(); const d = Math.abs(b.top + b.height / 2 - mid) / (innerHeight * 0.45); return Math.max(0.28, 1 - Math.min(1, d) * 0.72); });
        rows.forEach((r, i) => { const v = vals[i].toFixed(3); if (r._snO !== v) { r._snO = v; r.style.opacity = v; } }); };
      const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };
      rows.forEach(r => r.style.transition = 'opacity .25s linear');
      addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); req();
    }
  }

  function init() {
    document.documentElement.style.setProperty('--sn-d', TRANS.dur + 'ms'); document.documentElement.style.setProperty('--sn-e', TRANS.easing);
    window.__snErr = [];
    [faq, appear, reveals, revealsFallback, glyphRoom, compare, scrollTransforms, loops, () => bindStates(document.body), bindInstanceStates, portals, textFx, navHide, booking, storyStrip, tickers, slideshows, counters, video, forms, anchors, reel, toc, showMore, stackMobile]
      .forEach(f => { try { f(); } catch (e) { window.__snErr.push((f.name || 'step') + ': ' + e.message); console.error(e); } });
    let bp = BP(); addEventListener('resize', () => { if (BP() !== bp) { bp = BP(); $$('[class*="framer-v-"]').forEach(e => e._snH = 0); bindStates(document.body); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
