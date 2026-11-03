/* ============================================================
   剧境 DramaRef · 动效引擎 motion.js
   星域 / 磁吸 / 倾斜 / 揭示 / 计数 / 转场 / 时间码 / 光晕
   ============================================================ */

/* 标记 JS 可用：动效只在此时启用隐藏/入场，避免脚本失败导致内容隐形 */
document.documentElement.classList.add("js");

/* ---------- 星域粒子 ---------- */
function initStars() {
  const cvs = document.getElementById("stars");
  if (!cvs) return;
  const ctx = cvs.getContext("2d");
  let w, h, dpr, particles = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = cvs.width = window.innerWidth * dpr;
    h = cvs.height = window.innerHeight * dpr;
    cvs.style.width = window.innerWidth + "px";
    cvs.style.height = window.innerHeight + "px";
    ctx.scale(dpr, dpr);
  }
  function build() {
    const n = Math.min(110, Math.floor(window.innerWidth / 13));
    particles = Array.from({ length: n }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.3,
      a: Math.random() * 0.5 + 0.15,
      vy: Math.random() * 0.12 + 0.02,
      ember: Math.random() > 0.86
    }));
  }
  resize(); build();
  window.addEventListener("resize", () => { ctx.setTransform(1,0,0,1,0,0); resize(); build(); });

  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.y -= p.vy;
      if (p.y < -4) { p.y = window.innerHeight + 4; p.x = Math.random() * window.innerWidth; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.ember ? `rgba(255,107,61,${p.a})` : `rgba(237,231,219,${p.a * 0.8})`;
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  // 尊重减少动效
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) tick();
}

/* ---------- 光标光晕 ---------- */
function initCursorGlow() {
  const el = document.querySelector(".cursor-glow");
  if (!el) return;
  let tx = window.innerWidth / 2, ty = window.innerHeight / 2, cx = tx, cy = ty;
  window.addEventListener("mousemove", e => { tx = e.clientX; ty = e.clientY; });
  function loop() {
    cx += (tx - cx) * 0.12;
    cy += (ty - cy) * 0.12;
    el.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  }
  loop();
}

/* ---------- 磁吸 ---------- */
function initMagnetic() {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  document.querySelectorAll(".mag").forEach(el => {
    let raf;
    el.addEventListener("mousemove", e => {
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      const strength = el.dataset.mag || 0.35;
      const cap = el.dataset.magCap || 12;
      const dx = Math.max(-cap, Math.min(cap, mx * strength));
      const dy = Math.max(-cap, Math.min(cap, my * strength));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { el.style.transform = `translate(${dx}px,${dy}px)`; });
    });
    el.addEventListener("mouseleave", () => {
      cancelAnimationFrame(raf);
      el.style.transition = "transform .5s cubic-bezier(.16,1,.3,1)";
      el.style.transform = "translate(0,0)";
      setTimeout(() => { el.style.transition = ""; }, 500);
    });
  });
}

/* ---------- 3D 倾斜 ---------- */
function initTilt() {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  document.querySelectorAll("[data-tilt]").forEach(el => {
    const max = parseFloat(el.dataset.tilt) || 8;
    el.addEventListener("mousemove", e => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg) scale(1.015)`;
    });
    el.addEventListener("mouseleave", () => {
      el.style.transition = "transform .6s cubic-bezier(.16,1,.3,1)";
      el.style.transform = "perspective(900px) rotateY(0) rotateX(0) scale(1)";
      setTimeout(() => { el.style.transition = ""; }, 600);
    });
  });
}

/* ---------- 滚动揭示 ---------- */
function initReveal() {
  const els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        const els2 = [...en.target.parentElement.querySelectorAll("[data-reveal]")];
        const i = els2.indexOf(en.target);
        en.target.style.transitionDelay = (Math.max(0, i) * 0.075) + "s";
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  els.forEach(el => io.observe(el));
}

/* ---------- 数字滚动 ---------- */
function initCountUp() {
  const els = document.querySelectorAll("[data-count]");
  if (!els.length) return;
  const fmt = n => (n >= 1000 ? n.toLocaleString("en-US") : String(n));
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.forEach(el => { el.textContent = fmt(parseFloat(el.dataset.count)); });
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const target = parseFloat(el.dataset.count);
      const dur = 1500;
      const t0 = performance.now();
      const fmt = n => n >= 1000 ? n.toLocaleString("en-US") : String(n);
      function step(t) {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(target * e));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  els.forEach(el => io.observe(el));
}

/* ---------- 导航滚动态 ---------- */
function initNav() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---------- 时间码 ---------- */
function initTimecode() {
  const el = document.getElementById("timecode");
  if (!el) return;
  let f = 0;
  const pad = n => String(n).padStart(2, "0");
  setInterval(() => {
    f++;
    const total = f;
    const fr = total % 24;
    const sec = Math.floor(total / 24) % 60;
    const min = Math.floor(total / 1440) % 60;
    const hr = Math.floor(total / 86400) % 24;
    el.innerHTML = `<span>${pad(hr)}</span>:${pad(min)}:${pad(sec)}:${pad(fr)}`;
  }, 42);
}

/* ---------- HERO 标题入场 ---------- */
function initHero() {
  const h = document.querySelector(".hero h1");
  if (!h) return;
  const go = () => h.classList.add("ready");
  requestAnimationFrame(() => requestAnimationFrame(go));
  window.addEventListener("load", go);
  setTimeout(go, 600);
}

/* ---------- 转场遮罩 ---------- */
function initVeil() {
  const veil = document.querySelector(".veil");
  if (!veil) return;
  // 入场不做遮挡（避免阻塞内容），仅用 body 淡入；遮罩只用于跳页转场
  // 离场：点击站内 .html 链接时升起
  document.querySelectorAll('a[href$=".html"]').forEach(a => {
    a.addEventListener("click", e => {
      const href = a.getAttribute("href");
      if (!href || href.startsWith("http")) return;
      e.preventDefault();
      veil.classList.add("show");
      setTimeout(() => { window.location.href = href; }, 620);
    });
  });
}

/* ---------- 中英切换（轻量） ---------- */
function initLang() {
  const btns = document.querySelectorAll(".lang button");
  if (!btns.length) return;
  document.querySelectorAll("[data-en]").forEach(el => {
    if (el.dataset.zh == null) el.dataset.zh = el.textContent;
  });
  function set(lang) {
    document.querySelectorAll("[data-en]").forEach(el => {
      el.textContent = lang === "en" ? el.dataset.en : el.dataset.zh;
    });
    btns.forEach(b => b.classList.toggle("active", b.dataset.lang === lang));
    document.documentElement.lang = lang;
    try { localStorage.setItem("dramaref-lang", lang); } catch (e) {}
  }
  btns.forEach(b => b.addEventListener("click", () => set(b.dataset.lang)));
  try {
    const s = localStorage.getItem("dramaref-lang");
    if (s) set(s);
  } catch (e) {}
}

/* ---------- Toast ---------- */
function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 2200);
}

document.addEventListener("DOMContentLoaded", () => {
  initStars();
  initCursorGlow();
  initMagnetic();
  initTilt();
  initReveal();
  initCountUp();
  initNav();
  initTimecode();
  initHero();
  initVeil();
  initLang();
});
