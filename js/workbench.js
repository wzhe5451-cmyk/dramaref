/* ============================================================
   DramaRef · 服装与人物参考工作台
   数据来自 js/library-data.js（window.LIBRARY）
   ============================================================ */
(function () {
  "use strict";

  const LIB = window.LIBRARY || { stats: {}, items: [] };
  const CH = window.CHARS || { stats: {}, items: [] };
  const SRC = window.SOURCES || { stats: {}, items: [] };
  let ITEMS = (LIB.items || []).slice();
  const PAGE = 96;

  const $ = (id) => document.getElementById(id);
  const FAV_KEY = "dramaref.favs";

  const S = {
    kind: "costume",
    cat: "all",
    style: "all",
    gender: "all",
    src: "all",
    hair: "all",
    region: "all",
    country: "all",
    q: "",
    favOnly: false,
    mine: false,
    selected: null,
    shown: 0,
    filtered: [],
    favs: new Set(),
  };

  const HAIR_ORDER = ["短发", "中发", "中长发", "长发"];
  const KIND_TITLE = { costume: "服装参考", worn: "上身实拍", character: "人物参考" };
  const KIND_LABEL = { costume: "服装", worn: "上身实拍", character: "人物" };

  // 卡片副标题：只补标题里没出现的信息，避免「长发 · 人脸 / 日本 · 长发」这种重复
  function subLine(x) {
    if (x.kind === "character") {
      const t = x.zh || "";
      return [x.hair, x.country].filter((v) => v && !t.includes(v)).join(" · ");
    }
    return [x.cat, x.series].filter(Boolean).join(" · ");
  }

  /* ---------- 合并「我的上传」+ 四站采集 + 人物库 ---------- */
  function rebuildItems() {
    const mine = (window.Uploads && window.Uploads.items) || [];
    // 人物走独立数据层（含发长 / 地区），避免与旧库人物重复计数
    const chars = (CH.items && CH.items.length)
      ? CH.items
      : (LIB.items || []).filter((x) => x.kind === "character");
    const libCostumes = (LIB.items || []).filter((x) => x.kind !== "character");
    // 自己上传的排最前，入库后立刻能在首屏看到
    ITEMS = mine.concat(SRC.items || [], chars, libCostumes);
  }

  /* ---------- 库容量文案 ---------- */
  function syncStats() {
    const st = LIB.stats || {};
    const srcItems = SRC.items || [];
    const pure = srcItems.filter((x) => x.kind === "costume").length;
    const worn = srcItems.length - pure;
    const ov = (CH.stats && CH.stats.overseas) || 0;
    const el = $("libStats");
    if (!el) return;
    const total = (st.libTotal || st.total || 0) + srcItems.length;
    const bits = [];
    if (pure) bits.push(`独立服饰 ${pure}`);
    if (worn) bits.push(`实拍上身 ${worn}`);
    if (ov) bits.push(`海外人物 ${ov}`);
    el.textContent = `全库 ${total.toLocaleString()} 条 · 本地 ${ITEMS.length.toLocaleString()} 条` +
      (bits.length ? `（采集 ${bits.join(" · ")}）` : "");
  }

  /* ---------- 收藏持久化 ---------- */
  function loadFavs() {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) S.favs = new Set(JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }
  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...S.favs])); } catch (e) { /* ignore */ }
  }
  function syncFavCount() {
    const n = $("favCount");
    if (n) n.textContent = S.favs.size;
    const t = $("favToggle");
    if (t) t.classList.toggle("on", S.favOnly);
  }

  /* ---------- 工具 ---------- */
  const byKind = (k) => ITEMS.filter((x) => x.kind === k);
  const titleOf = (x) => (document.documentElement.dataset.lang === "en" && x.en ? x.en : x.zh);

  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2000);
  }

  /* ---------- 侧栏：类型计数 ---------- */
  function renderKinds() {
    $("kCostume").textContent = byKind("costume").length;
    const kw = $("kWorn");
    if (kw) kw.textContent = byKind("worn").length;
    $("kCharacter").textContent = byKind("character").length;
    document.querySelectorAll(".kind-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.kind === S.kind);
    });

    const mine = ITEMS.filter((x) => x.mine).length;
    const mc = $("mineCount");
    if (mc) mc.textContent = mine;
    const mb = $("mineBtn");
    if (mb) {
      mb.classList.toggle("on", S.mine && mine > 0);
      const t = mb.querySelector(".mb-t");
      if (t) t.textContent = mine ? "我上传的" : "上传第一张";
      const ic = mb.querySelector(".mb-ic");
      if (ic) ic.textContent = mine ? "＋" : "↑";
    }
  }

  /* ---------- 侧栏：来源（四站采集） ---------- */
  const SRC_LABEL = { shopbop: "Shopbop · 独立服饰", withawish: "with a WISH", armstreet: "Armstreet", demobaza: "DEMOBAZA", vogue: "VOGUE 秀场" };
  function renderSrcs() {
    const pool = byKind(S.kind).filter((x) => !S.mine || x.mine);
    const counts = new Map();
    for (const x of pool) if (x.source) counts.set(x.source, (counts.get(x.source) || 0) + 1);

    const block = $("srcBlock");
    if (!block) return;
    if (!counts.size) { block.style.display = "none"; return; }
    block.style.display = "";
    $("srcList").innerHTML =
      `<button class="cat-item ${S.src === "all" ? "active" : ""}" data-src="all">
         <span>全部来源</span><em>${pool.length}</em>
       </button>` +
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `<button class="cat-item ${S.src === k ? "active" : ""}" data-src="${k}">
            <span>${SRC_LABEL[k] || k}</span><em>${n}</em>
          </button>`)
        .join("");
  }

  /* ---------- 侧栏：发长 / 地区 / 国家（人物专用） ---------- */
  function charPool() {
    return S.kind === "character" ? byKind("character").filter((x) => !S.mine || x.mine) : [];
  }

  function renderHair() {
    const block = $("hairBlock");
    if (!block) return;
    if (S.kind !== "character") { block.style.display = "none"; return; }
    block.style.display = "";

    const pool = charPool().filter((x) => S.region === "all" || x.region === S.region);
    // 与地区/国家交叉后的可用量
    const narrow = new Map();
    for (const x of pool) {
      if (S.country !== "all" && x.country !== S.country) continue;
      if (x.hair) narrow.set(x.hair, (narrow.get(x.hair) || 0) + 1);
    }

    const list = HAIR_ORDER;
    $("hairList").innerHTML =
      `<button class="cat-item ${S.hair === "all" ? "active" : ""}" data-hair="all">
         <span>全部发长</span><em>${pool.length}</em>
       </button>` +
      list.map((h) => {
        const n = narrow.get(h) || 0;
        return `<button class="cat-item ${S.hair === h ? "active" : ""} ${n ? "" : "dim"}" data-hair="${h}">
            <span>${h}</span><em>${n}</em>
          </button>`;
      }).join("");
  }

  function renderRegion() {
    const block = $("regionBlock");
    if (!block) return;
    if (S.kind !== "character") { block.style.display = "none"; return; }
    block.style.display = "";

    const pool = charPool();
    const narrowed = pool.filter((x) => S.hair === "all" || x.hair === S.hair);
    const cnt = (r) => narrowed.filter((x) => x.region === r).length;

    $("regionList").innerHTML =
      `<button class="cat-item ${S.region === "all" ? "active" : ""}" data-region="all">
         <span>全部地区</span><em>${narrowed.length}</em>
       </button>
       <button class="cat-item ${S.region === "国内" ? "active" : ""} ${cnt("国内") ? "" : "dim"}" data-region="国内">
         <span>国内</span><em>${cnt("国内")}</em>
       </button>
       <button class="cat-item ${S.region === "海外" ? "active" : ""} ${cnt("海外") ? "" : "dim"}" data-region="海外">
         <span>海外</span><em>${cnt("海外")}</em>
       </button>`;
  }

  function renderCountry() {
    const block = $("countryBlock");
    if (!block) return;
    if (S.kind !== "character" || S.region !== "海外") { block.style.display = "none"; return; }

    const pool = charPool().filter((x) => x.region === "海外" && (S.hair === "all" || x.hair === S.hair));
    const counts = new Map();
    for (const x of pool) if (x.country) counts.set(x.country, (counts.get(x.country) || 0) + 1);
    if (counts.size < 2) { block.style.display = "none"; return; }
    block.style.display = "";

    $("countryRow").innerHTML =
      `<button class="pill ${S.country === "all" ? "active" : ""}" data-country="all">全部</button>` +
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
        .map(([c, n]) => `<button class="pill ${S.country === c ? "active" : ""}" data-country="${c}">${c} <em>${n}</em></button>`)
        .join("");
  }

  /* ---------- 侧栏：分类 ---------- */
  function renderCats() {
    renderSrcs();
    renderHair();
    renderRegion();
    renderCountry();
    const pool = byKind(S.kind).filter(
      (x) => (!S.mine || x.mine) && (S.src === "all" || x.source === S.src)
    );
    const counts = new Map();
    for (const x of pool) counts.set(x.cat, (counts.get(x.cat) || 0) + 1);

    // 尊重 style / gender 的收窄，让计数反映可用量
    const narrowed = pool.filter(
      (x) =>
        (S.style === "all" || x.style === S.style) &&
        (S.gender === "all" || (x.tags || []).includes(S.gender)) &&
        (S.hair === "all" || x.hair === S.hair) &&
        (S.region === "all" || x.region === S.region) &&
        (S.country === "all" || x.country === S.country)
    );
    const narrow = new Map();
    for (const x of narrowed) narrow.set(x.cat, (narrow.get(x.cat) || 0) + 1);

    const cats = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    const list = $("catList");
    list.innerHTML =
      `<button class="cat-item ${S.cat === "all" ? "active" : ""}" data-cat="all">
         <span>全部</span><em>${pool.length}</em>
       </button>` +
      cats
        .map((c) => {
          const n = narrow.get(c) || 0;
          return `<button class="cat-item ${S.cat === c ? "active" : ""} ${n ? "" : "dim"}" data-cat="${c}">
              <span>${c}</span><em>${n}</em>
            </button>`;
        })
        .join("");
  }

  /* ---------- 侧栏：风格 / 性别 ---------- */
  function renderPills() {
    const pool = byKind(S.kind).filter(
      (x) => (!S.mine || x.mine) && (S.src === "all" || x.source === S.src)
    );
    const ORDER = ["写实", "动漫", "自建"];
    const styles = [...new Set(pool.map((x) => x.style).filter(Boolean))]
      .sort((a, b) => {
        const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    const genders = [...new Set(pool.flatMap((x) => x.tags || []).filter((t) => t === "女性" || t === "男性"))];

    $("styleRow").innerHTML =
      `<button class="pill ${S.style === "all" ? "active" : ""}" data-style="all">全部</button>` +
      styles.map((s) => `<button class="pill ${S.style === s ? "active" : ""}" data-style="${s}">${s}</button>`).join("");

    $("genderRow").innerHTML =
      `<button class="pill ${S.gender === "all" ? "active" : ""}" data-gender="all">全部</button>` +
      genders.map((g) => `<button class="pill ${S.gender === g ? "active" : ""}" data-gender="${g}">${g}</button>`).join("");

    // 只有单一取值时不展示该组筛选（避免空转控件）
    const sg = $("styleRow").closest(".side-block");
    const gg = $("genderRow").closest(".side-block");
    if (sg) sg.style.display = styles.length > 1 ? "" : "none";
    if (gg) gg.style.display = genders.length > 1 ? "" : "none";
  }

  /* ---------- 切换类型（自愈残留筛选） ---------- */
  function setKind(k) {
    if (k !== "costume" && k !== "worn" && k !== "character") return;
    S.kind = k;
    S.cat = "all";
    S.src = "all";
    S.hair = "all";
    S.region = "all";
    S.country = "all";
    S.selected = null;

    // 关键：风格 / 性别是跨类型共用的状态，服装有「动漫」而人物没有，
    // 若不清掉，切过去就会得到 0 条，且侧栏里已无该按钮，用户无从发现。
    const pool = byKind(k);
    if (S.style !== "all" && !pool.some((x) => x.style === S.style)) S.style = "all";
    if (S.gender !== "all" && !pool.some((x) => (x.tags || []).includes(S.gender))) S.gender = "all";

    const t = $("stageTitle");
    if (t) t.textContent = KIND_TITLE[k] || "参考";

    renderKinds(); renderCats(); renderPills(); syncWall();

    const stage = document.querySelector(".stage");
    if (stage) stage.scrollTop = 0;
  }

  /* ---------- 过滤 ---------- */
  function applyFilter() {
    const q = S.q.trim().toLowerCase();
    S.filtered = ITEMS.filter((x) => {
      if (x.kind !== S.kind) return false;
      if (S.mine && !x.mine) return false;
      if (S.cat !== "all" && x.cat !== S.cat) return false;
      if (S.src !== "all" && x.source !== S.src) return false;
      if (S.hair !== "all" && x.hair !== S.hair) return false;
      if (S.region !== "all" && x.region !== S.region) return false;
      if (S.country !== "all" && x.country !== S.country) return false;
      if (S.style !== "all" && x.style !== S.style) return false;
      if (S.gender !== "all" && !(x.tags || []).includes(S.gender)) return false;
      if (S.favOnly && !S.favs.has(x.id)) return false;
      if (q) {
        const hay = [x.zh, x.en, x.code, x.cat, x.series, x.brand, x.country, x.hair, x.region, (x.tags || []).join(" ")]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    S.shown = 0;
  }

  /* ---------- 图墙 ---------- */
  function cardHTML(x, i) {
    const fav = S.favs.has(x.id) ? "on" : "";
    const sel = S.selected && S.selected.id === x.id ? "sel" : "";
    return `<figure class="tile ${sel}" data-id="${x.id}" style="animation-delay:${Math.min(i, 20) * 0.018}s">
      <div class="tile-img">
        <img src="${x.img}" alt="${x.zh || ""}" loading="lazy" decoding="async">
        <div class="tile-shade"></div>
        <span class="tile-code">${x.code || ""}</span>
        ${x.mine ? '<span class="tile-up">UPLOAD</span>' : ''}
        <button class="tile-fav ${fav}" data-fav="${x.id}" title="收藏">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20s-7-4.6-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.4 12 20 12 20z"/>
          </svg>
        </button>
      </div>
      <figcaption>
        <div class="t" title="${x.zh || x.code}">${x.zh || x.code}</div>
        <div class="s">${subLine(x)}</div>
      </figcaption>
    </figure>`;
  }

  function renderMore() {
    const wall = $("wall");
    const next = S.filtered.slice(S.shown, S.shown + PAGE);
    if (!next.length) return;

    const frag = document.createElement("div");
    frag.innerHTML = next.map((x, i) => cardHTML(x, i)).join("");

    // 只对刚插入的节点绑定事件
    [...frag.children].forEach((el) => {
      bindTilt(el);
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-fav]")) return;
        const item = ITEMS.find((x) => String(x.id) === el.dataset.id);
        if (item) select(item);
      });
      const fb = el.querySelector("[data-fav]");
      if (fb) {
        fb.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleFav(fb.dataset.fav);
        });
      }
      wall.appendChild(el);
    });

    S.shown += next.length;
  }

  function bindTilt(el) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(700px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateY(-4px)`;
    });
    el.addEventListener("pointerleave", () => { el.style.transform = ""; });
  }

  function syncWall() {
    applyFilter();
    $("resultCount").textContent = S.filtered.length;
    $("wall").innerHTML = "";
    const empty = $("wallEmpty");
    empty.hidden = S.filtered.length > 0;

    if (!S.filtered.length) {
      const active = [];
      if (S.mine) active.push("只看我的资产");
      if (S.cat !== "all") active.push("分类「" + S.cat + "」");
      if (S.src !== "all") active.push("来源「" + (SRC_LABEL[S.src] || S.src) + "」");
      if (S.hair !== "all") active.push("发长「" + S.hair + "」");
      if (S.region !== "all") active.push("地区「" + S.region + "」");
      if (S.country !== "all") active.push("国家「" + S.country + "」");
      if (S.style !== "all") active.push("风格「" + S.style + "」");
      if (S.gender !== "all") active.push("性别「" + S.gender + "」");
      if (S.q) active.push("关键词「" + S.q + "」");
      const hint = $("emptyHint");
      if (hint) {
        hint.textContent = active.length
          ? "当前生效条件：" + active.join(" · ") + "。清掉它们就能看到全部" + (KIND_LABEL[S.kind] || "资产") + "。"
          : "换个关键词试试。";
      }
    }

    if (
      !S.selected ||
      S.selected.kind !== S.kind ||
      !S.filtered.some((x) => x.id === S.selected.id)
    ) {
      S.selected = S.filtered[0] || null;
    }
    renderMore();
    syncSelClass();
    renderDetail();
  }

  function syncSelClass() {
    const id = S.selected ? String(S.selected.id) : "";
    document.querySelectorAll(".tile").forEach((el) => {
      el.classList.toggle("sel", el.dataset.id === id);
    });
  }

  /* ---------- 详情 ---------- */
  function renderDetail() {
    const x = S.selected;
    if (!x) {
      $("dImg").removeAttribute("src");
      $("dCode").textContent = "—";
      $("dTitle").textContent = "未选中参考";
      $("dSub").textContent = "左侧筛选后挑一张";
      $("dTags").innerHTML = "";
      $("dMeta").innerHTML = "";
      $("dFav").classList.remove("on");
      $("dDownload").removeAttribute("href");
      const del = $("dDelete");
      if (del) del.hidden = true;
      return;
    }
    $("dImg").src = x.img;
    $("dImg").alt = x.zh || "";
    $("dCode").textContent = x.code || "";
    $("dTitle").textContent = x.zh || x.code || "—";
    $("dSub").textContent = x.kind === "character"
      ? [x.cat, x.country].filter(Boolean).join(" · ")
      : [x.cat, x.series].filter(Boolean).join(" · ");

    $("dTags").innerHTML = (x.tags || [])
      .map((t) => `<span class="d-tag">${t}</span>`)
      .join("") + (x.style ? `<span class="d-tag style">${x.style}</span>` : "");

    const rows = [
      ["编号", x.code],
      ["类型", KIND_LABEL[x.kind] || "参考"],
      ["分类", x.cat],
      ["品牌", x.brand || x.series],
    ];
    if (x.series && x.brand && x.series !== x.brand) rows.push(["系列", x.series]);
    if (x.hair) rows.push(["发长", x.hair]);
    if (x.region) rows.push(["地区", x.region]);
    if (x.country) rows.push(["国家", x.country]);
    $("dMeta").innerHTML = rows
      .filter(([, v]) => v)
      .map(([k, v]) => `<div class="d-cell"><span>${k}</span><b>${v}</b></div>`)
      .join("");

    const fav = $("dFav");
    fav.classList.toggle("on", S.favs.has(x.id));
    const dl = $("dDownload");
    dl.href = x.src || x.img;
    if (x.mine) {
      dl.setAttribute("download", (x.zh || x.code || "reference") + ".jpg");
      dl.removeAttribute("target");
    } else {
      dl.removeAttribute("download");
      dl.setAttribute("target", "_blank");
    }
    $("dFav").dataset.id = x.id;

    const del = $("dDelete");
    if (del) {
      del.hidden = !x.mine;
      del.dataset.id = x.id;
    }
  }

  function select(item) {
    S.selected = item;
    syncSelClass();
    renderDetail();
    $("detail").classList.add("live");
    setTimeout(() => $("detail").classList.remove("live"), 400);
  }

  /* ---------- 收藏 ---------- */
  function toggleFav(id) {
    id = String(id);
    if (S.favs.has(id)) S.favs.delete(id);
    else S.favs.add(id);
    saveFavs();
    syncFavCount();
    document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => b.classList.toggle("on", S.favs.has(id)));
    if (S.selected && String(S.selected.id) === id) {
      $("dFav").classList.toggle("on", S.favs.has(id));
    }
    if (S.favOnly) syncWall();
  }

  /* ---------- 清空筛选 ---------- */
  function resetFilters() {
    S.cat = "all"; S.style = "all"; S.gender = "all"; S.src = "all";
    S.hair = "all"; S.region = "all"; S.country = "all";
    S.q = ""; S.favOnly = false; S.mine = false;
    const si = $("searchInput");
    if (si) si.value = "";
    syncFavCount();
    renderCats(); renderPills(); syncWall();
    toast("已清空筛选");
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $("kindList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-kind]");
      if (!b) return;
      setKind(b.dataset.kind);
    });

    const er = $("emptyReset");
    if (er) er.addEventListener("click", () => resetFilters());

    $("catList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      S.cat = b.dataset.cat;
      renderCats(); syncWall();
    });

    const sl = $("srcList");
    if (sl) {
      sl.addEventListener("click", (e) => {
        const b = e.target.closest("[data-src]");
        if (!b) return;
        S.src = b.dataset.src;
        S.cat = "all";
        renderCats(); renderPills(); syncWall();
        const stage = document.querySelector(".stage");
        if (stage) stage.scrollTop = 0;
      });
    }

    const hl = $("hairList");
    if (hl) {
      hl.addEventListener("click", (e) => {
        const b = e.target.closest("[data-hair]");
        if (!b) return;
        S.hair = b.dataset.hair;
        S.cat = "all";
        renderCats(); syncWall();
        const stage = document.querySelector(".stage");
        if (stage) stage.scrollTop = 0;
      });
    }

    const rg = $("regionList");
    if (rg) {
      rg.addEventListener("click", (e) => {
        const b = e.target.closest("[data-region]");
        if (!b) return;
        S.region = b.dataset.region;
        S.country = "all";
        S.cat = "all";
        renderCats(); syncWall();
        const stage = document.querySelector(".stage");
        if (stage) stage.scrollTop = 0;
      });
    }

    const cr = $("countryRow");
    if (cr) {
      cr.addEventListener("click", (e) => {
        const b = e.target.closest("[data-country]");
        if (!b) return;
        S.country = b.dataset.country;
        S.cat = "all";
        renderCats(); syncWall();
        const stage = document.querySelector(".stage");
        if (stage) stage.scrollTop = 0;
      });
    }

    $("styleRow").addEventListener("click", (e) => {
      const b = e.target.closest("[data-style]");
      if (!b) return;
      S.style = b.dataset.style;
      renderCats(); renderPills(); syncWall();
    });

    $("genderRow").addEventListener("click", (e) => {
      const b = e.target.closest("[data-gender]");
      if (!b) return;
      S.gender = b.dataset.gender;
      renderCats(); renderPills(); syncWall();
    });

    $("resetBtn").addEventListener("click", () => resetFilters());

    let t;
    $("searchInput").addEventListener("input", (e) => {
      clearTimeout(t);
      const v = e.target.value;
      t = setTimeout(() => { S.q = v; syncWall(); }, 140);
    });

    $("favToggle").addEventListener("click", () => {
      S.favOnly = !S.favOnly;
      syncFavCount();
      syncWall();
      toast(S.favOnly ? "只看收藏" : "显示全部");
    });

    $("dFav").addEventListener("click", () => {
      if (S.selected) toggleFav(S.selected.id);
    });

    // 我的资产筛选
    const mb = $("mineBtn");
    if (mb) {
      mb.addEventListener("click", () => {
        const mineAll = ITEMS.filter((x) => x.mine);
        if (!mineAll.length) {
          if (window.Uploads) window.Uploads.open();
          return;
        }
        S.mine = !S.mine;
        S.cat = "all";
        renderKinds(); renderCats(); renderPills(); syncWall();
        toast(S.mine ? "只看我上传的 " + mineAll.length + " 条" : "显示全部参考");
      });
    }

    // 删除自己上传的资产
    const dDel = $("dDelete");
    if (dDel) {
      dDel.addEventListener("click", async () => {
        const x = S.selected;
        if (!x || !x.mine || !window.Uploads) return;
        if (!window.confirm("从我的资产移除「" + (x.zh || x.code) + "」？图片会从本机存储里删除，无法恢复。")) return;
        await window.Uploads.remove(x.id);
        toast("已移除");
      });
    }

    $("dUse").addEventListener("click", async () => {
      const x = S.selected;
      if (!x) return;
      const text = [...new Set([
        KIND_TITLE[x.kind] || "参考",
        x.zh, x.code, x.cat, x.series, x.brand, x.hair, x.region, x.country,
        (x.tags || []).join("/"),
      ].filter(Boolean))].join(" · ");
      try {
        await navigator.clipboard.writeText(text);
        toast("已复制：" + text);
      } catch (e) {
        toast(text);
      }
    });

    // 无限滚动（stage 内部滚动）
    const stage = document.querySelector(".stage");
    if (stage) {
      stage.addEventListener("scroll", () => {
        const bar = document.querySelector(".stage-bar");
        if (bar) bar.classList.toggle("scrolled", stage.scrollTop > 26);
        if (S.shown >= S.filtered.length) return;
        if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 800) renderMore();
      }, { passive: true });
    }

    // ⌘K 聚焦搜索
    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        $("searchInput").focus();
      }
    });

    // 站内 #costume / #character 直达
    window.addEventListener("hashchange", () => {
      const h = (location.hash || "").replace("#", "");
      if (KIND_TITLE[h]) setKind(h);
    });
  }

  /* ---------- 启动 ---------- */
  async function init() {
    bind();

    loadFavs();

    // 支持 #costume / #character 直达
    const h = (location.hash || "").replace("#", "");
    if (KIND_TITLE[h]) {
      S.kind = h;
      $("stageTitle").textContent = KIND_TITLE[h];
    }

    // 合并本机上传的资产
    if (window.Uploads) {
      let lastMine = -1;
      window.Uploads.onChange = () => {
        const mine = window.Uploads.items || [];
        rebuildItems();

        // 刚入库：直接跳到那一类并选中它，用户立刻看到结果
        if (lastMine >= 0 && mine.length > lastMine) {
          const latest = mine[0];
          if (latest) {
            S.kind = latest.kind;
            S.cat = "all"; S.style = "all"; S.gender = "all";
            S.mine = false;
            S.selected = latest;
            const t = $("stageTitle");
            if (t) t.textContent = KIND_TITLE[S.kind] || "参考";
          }
        }
        lastMine = mine.length;
        if (S.mine && !mine.length) S.mine = false;

        syncStats();
        renderKinds(); renderCats(); renderPills(); syncWall();
      };
      await window.Uploads.init();
      lastMine = (window.Uploads.items || []).length;
    }

    rebuildItems();
    syncStats();
    syncFavCount();
    renderKinds();
    renderCats();
    renderPills();
    syncWall();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
