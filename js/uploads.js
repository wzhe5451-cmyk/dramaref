/* ============================================================
   DramaRef · 自定义资产上传
   - 图片以 Blob 存 IndexedDB，刷新后仍在
   - 对外暴露 window.Uploads，供 workbench.js 合并进图墙
   ============================================================ */
(function () {
  "use strict";

  const DB_NAME = "dramaref.uploads";
  const STORE = "assets";
  const VERSION = 1;
  const MAX_BYTES = 12 * 1024 * 1024;
  const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/avif"];

  const COSTUME_CATS = ["夏日穿搭", "冬日穿搭", "春日穿搭", "秋日穿搭", "内衣", "魅力穿搭", "泳装", "派对礼服", "幻想服饰"];
  const CHARACTER_CATS = ["人脸", "人物造型"];

  let db = null;
  let bound = false;

  const U = {
    items: [],        // 已入库（带 url / blob）
    queue: [],        // 待入库
    onChange: null,   // 入库 / 删除后回调
    init: init,
    open: openDrawer,
    close: closeDrawer,
    count: () => U.items.length,
  };

  const $ = (id) => document.getElementById(id);

  /* ---------------- IndexedDB ---------------- */
  function openDB() {
    return new Promise((res, rej) => {
      if (db) return res(db);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => { db = req.result; res(db); };
      req.onerror = () => rej(req.error);
    });
  }

  function store(mode) {
    return openDB().then((d) => d.transaction(STORE, mode).objectStore(STORE));
  }

  function wrap(request) {
    return new Promise((res, rej) => {
      request.onsuccess = () => res(request.result);
      request.onerror = () => rej(request.error);
    });
  }

  async function readAll() {
    const s = await store("readonly");
    const list = await wrap(s.getAll());
    return list
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        code: r.code,
        zh: r.zh,
        en: "",
        cat: r.cat,
        series: r.series,
        style: "自建",
        tags: r.tags || [],
        country: "",
        mine: true,
        createdAt: r.createdAt,
        mime: r.mime,
        size: r.size,
        w: r.w,
        h: r.h,
        blob: r.blob,
        img: URL.createObjectURL(r.blob),
        src: URL.createObjectURL(r.blob),
      }));
  }

  /* ---------------- 小工具 ---------------- */
  function toast(msg, tone) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.borderColor = tone === "warn" ? "rgba(255,107,61,.6)" : "";
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.classList.remove("show"); el.style.borderColor = ""; }, 2400);
  }

  function bytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  }

  function probe(file) {
    return new Promise((res) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { res({ url, w: im.naturalWidth, h: im.naturalHeight }); };
      im.onerror = () => { res({ url, w: 0, h: 0 }); };
      im.src = url;
    });
  }

  function maxSeq() {
    let max = 0;
    U.items.forEach((x) => {
      const m = /^UP-(\d+)$/.exec(x.code || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
  }

  /* ---------------- 抽屉 ---------------- */
  function openDrawer() {
    const d = $("upDrawer"), s = $("upScrim");
    if (!d) return;
    d.classList.add("open");
    d.setAttribute("aria-hidden", "false");
    if (s) s.classList.add("on");
    document.body.classList.add("drawer-open");
    document.documentElement.classList.add("js");
    renderQueue();
    syncCatOptions();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pick = $("upPick");
    if (pick) { pick.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 520, delay: 180 }); }
  }

  function closeDrawer() {
    const d = $("upDrawer"), s = $("upScrim");
    if (!d) return;
    d.classList.remove("open");
    d.setAttribute("aria-hidden", "true");
    if (s) s.classList.remove("on");
    document.body.classList.remove("drawer-open");
  }

  function currentKind() {
    const seg = $("upKindSeg");
    const on = seg && seg.querySelector("[data-k].on");
    return on ? on.dataset.k : "character";
  }

  function currentGender() {
    const seg = $("upGenderSeg");
    const on = seg && seg.querySelector("[data-g].on");
    return on ? on.dataset.g : "";
  }

  function syncCatOptions() {
    const sel = $("upCat");
    if (!sel) return;
    const cats = currentKind() === "costume" ? COSTUME_CATS : CHARACTER_CATS;
    sel.innerHTML = cats.map((c) => `<option value="${c}">${c}</option>`).join("");
  }

  /* ---------------- 队列 ---------------- */
  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => ACCEPT.includes(f.type) || /\.(jpe?g|png|webp|avif)$/i.test(f.name));
    const rejected = [...fileList].length - files.length;
    let big = 0;

    for (const f of files) {
      if (f.size > MAX_BYTES) { big++; continue; }
      const p = await probe(f);
      U.queue.push({
        key: "q" + Date.now() + Math.random().toString(36).slice(2, 7),
        file: f,
        url: p.url,
        w: p.w,
        h: p.h,
        name: f.name.replace(/\.[^.]+$/, ""),
        kind: currentKind(),
      });
    }

    renderQueue();
    if (rejected) toast(rejected + " 个文件格式不支持", "warn");
    if (big) toast(big + " 个文件超过 12MB", "warn");
  }

  function renderQueue() {
    const wrap = $("upQueueWrap");
    const list = $("upList");
    const label = $("upQueueLabel");
    const commit = $("upCommit");
    if (!list) return;

    if (!U.queue.length) {
      if (wrap) wrap.hidden = true;
      if (commit) { commit.disabled = true; commit.textContent = "入库"; }
      return;
    }

    if (wrap) wrap.hidden = false;
    if (label) label.textContent = "已选 " + U.queue.length + " 个 · 将被识别为" + (currentKind() === "costume" ? "服装参考" : "人物参考");

    list.innerHTML = U.queue
      .map(
        (q, i) => `<div class="frow" data-k="${q.key}" style="animation-delay:${i * 0.045}s">
          <div class="fthumb"><img src="${q.url}" alt=""></div>
          <div class="finfo">
            <input class="fname" value="${esc(q.name)}" spellcheck="false">
            <div class="fmeta">${bytes(q.file.size)}${q.w ? " · " + q.w + "×" + q.h : ""}</div>
          </div>
          <button class="fdel" data-del="${q.key}" title="移除">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>`
      )
      .join("");

    list.querySelectorAll(".fname").forEach((inp) => {
      inp.addEventListener("input", () => {
        const row = inp.closest(".frow");
        const q = U.queue.find((x) => x.key === row.dataset.k);
        if (q) q.name = inp.value;
      });
    });

    list.querySelectorAll("[data-del]").forEach((b) => {
      b.addEventListener("click", () => {
        const i = U.queue.findIndex((x) => x.key === b.dataset.del);
        if (i > -1) { URL.revokeObjectURL(U.queue[i].url); U.queue.splice(i, 1); }
        renderQueue();
      });
    });

    if (commit) {
      commit.disabled = false;
      commit.textContent = "入库 " + U.queue.length + " 项";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /* ---------------- 入库 ---------------- */
  async function commit() {
    const btn = $("upCommit");
    if (!U.queue.length || !btn || btn.disabled) return;

    const kind = currentKind();
    const gender = currentGender();
    const cat = ($("upCat") && $("upCat").value) || (kind === "costume" ? COSTUME_CATS[0] : CHARACTER_CATS[0]);
    const project = ($("upProject") && $("upProject").value.trim()) || "";
    const series = project || "我的资产";

    btn.disabled = true;
    btn.textContent = "写入中…";

    const s = await store("readwrite");
    const now = Date.now();
    let n = 0;
    let seq = maxSeq();

    for (const q of U.queue) {
      const id = "up_" + now.toString(36) + "_" + n;
      const rec = {
        id,
        kind,
        code: "UP-" + String(++seq).padStart(4, "0"),
        zh: q.name || "未命名参考",
        cat,
        series,
        style: "自建",
        tags: gender ? [gender] : [],
        createdAt: now + n,
        mime: q.file.type || "image/jpeg",
        size: q.file.size,
        w: q.w,
        h: q.h,
        blob: q.file,
      };
      s.put(rec);
      n++;
    }

    await new Promise((res) => { s.transaction.oncomplete = res; s.transaction.onerror = res; });

    U.queue.forEach((q) => URL.revokeObjectURL(q.url));
    U.queue = [];
    renderQueue();

    // 重新读库，保证 code / url 一致
    U.items = await readAll();
    if (typeof U.onChange === "function") U.onChange();

    btn.textContent = "入库";
    closeDrawer();
    toast("已入库 " + n + " 项 · 刷新后仍在");
  }

  async function remove(id) {
    const s = await store("readwrite");
    s.delete(id);
    await new Promise((res) => { s.transaction.oncomplete = res; s.transaction.onerror = res; });
    const gone = U.items.find((x) => x.id === id);
    if (gone && gone.img) URL.revokeObjectURL(gone.img);
    U.items = await readAll();
    if (typeof U.onChange === "function") U.onChange();
  }

  /* ---------------- 绑定 ---------------- */
  function bind() {
    if (bound) return;
    bound = true;

    const openers = document.querySelectorAll("[data-open-upload]");
    openers.forEach((b) => b.addEventListener("click", openDrawer));

    const close = $("upClose"), cancel = $("upCancel"), scrim = $("upScrim");
    if (close) close.addEventListener("click", closeDrawer);
    if (cancel) cancel.addEventListener("click", () => { U.queue.forEach((q) => URL.revokeObjectURL(q.url)); U.queue = []; renderQueue(); closeDrawer(); });
    if (scrim) scrim.addEventListener("click", closeDrawer);

    const drop = $("upDrop"), input = $("upInput"), pick = $("upPick");
    if (pick && input) pick.addEventListener("click", (e) => { e.stopPropagation(); input.click(); });
    if (drop && input) {
      drop.addEventListener("click", () => input.click());
      input.addEventListener("change", () => { if (input.files && input.files.length) addFiles(input.files); input.value = ""; });
      ["dragenter", "dragover"].forEach((ev) =>
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); })
      );
      ["dragleave", "drop"].forEach((ev) =>
        drop.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "dragleave" && drop.contains(e.relatedTarget)) return; drop.classList.remove("over"); })
      );
      drop.addEventListener("drop", (e) => {
        if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      });
    }

    const seg = $("upKindSeg");
    if (seg) {
      seg.addEventListener("click", (e) => {
        const b = e.target.closest("[data-k]");
        if (!b) return;
        seg.querySelectorAll("[data-k]").forEach((x) => x.classList.toggle("on", x === b));
        syncCatOptions();
        renderQueue();
      });
    }

    const gseg = $("upGenderSeg");
    if (gseg) {
      gseg.addEventListener("click", (e) => {
        const b = e.target.closest("[data-g]");
        if (!b) return;
        gseg.querySelectorAll("[data-g]").forEach((x) => x.classList.toggle("on", x === b));
      });
    }

    const cb = $("upCommit");
    if (cb) cb.addEventListener("click", commit);

    // 整页拖拽兜底：拖到页面任意处也能上传
    window.addEventListener("dragover", (e) => { if (e.dataTransfer && e.dataTransfer.types.includes("Files")) e.preventDefault(); });
    window.addEventListener("drop", (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      if (e.target.closest && e.target.closest("#upDrawer")) return;
      e.preventDefault();
      openDrawer();
      addFiles(e.dataTransfer.files);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("drawer-open")) closeDrawer();
    });
  }

  /* ---------------- 初始化 ---------------- */
  async function init() {
    bind();
    try {
      U.items = await readAll();
    } catch (e) {
      U.items = [];
      toast("本地存储不可用，上传的资产只在本页有效", "warn");
    }
    U.ready = true;
    if (typeof U.onChange === "function") U.onChange();
    return U.items;
  }

  U.remove = remove;
  U.addFiles = addFiles;
  U.commit = commit;
  window.Uploads = U;
})();
