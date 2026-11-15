// Linkswell Product Information: hash-routed store-style UI over data.js + catalog.js.
// Routes: #/  ·  #/shop?make=&model=&year=&cat=&line=&screen=&manual=&q=&sort=  ·  #/p/<slug>  ·  #/a/<sku>  ·  #/support

const LINE_FULL = { xl: "T-Style XL Radio", gen6: "Gen 6 T-Style Radio", lite2: "T-Style Lite 2 Radio" };
const LINE_BLURB = {
  xl: "15.6″ screen with the on-screen X-Knob, 8 GB RAM / 128 GB, HDMI in and out.",
  gen6: "10.4–13″ screens, Qualcomm 8-core, Android 11, optional SIM slot on many models.",
  lite2: "12.1″ screen, Android 13, 4 GB / 64 GB, wireless CarPlay and Android Auto.",
};
const NO_PHOTO = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e2e5ea"/><text x="200" y="158" font-family="sans-serif" font-size="20" fill="#5b6575" text-anchor="middle">No photo</text></svg>');

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const uniq = (a) => [...new Set(a)];
const lineOf = (id) => LINES.find(l => l.id === id);
const fwOf = (id) => FIRMWARE.find(f => f.id === id);

// ---------- data prep ----------
// Radios Best Buy doesn't carry stay in data.js (hidden: true) but are left off the site.
for (let i = PRODUCTS.length - 1; i >= 0; i--) if (PRODUCTS[i].hidden) PRODUCTS.splice(i, 1);
PRODUCTS.forEach(p => {
  p.slug = p.slug || p.url.replace(/\/$/, "");
  p.cat = CATALOG[p.slug] || { images: [], specs: [], notes: [], videos: [], model: "", headline: "" };
  const m = (p.cat.headline || p.cat.specs[0]?.t || "").match(/([\d.]+)\s*[″"]/);
  p.screen = m ? m[1] : "";
  p.firstYear = Math.min(...p.fits.map(f => f[2]).concat(9999));
  p.manualHref = p.manual ? encodeURI(lineOf(p.line).folder + "/" + p.manual) : "";
  p.model = p.vpn || p.cat.model || "";
});
// Accessories without a LinksWell page can carry their own specs (and a source) in data.js.
ACCESSORIES.forEach(a => {
  a.cat = (a.url && CATALOG[a.url.replace(/\/$/, "")]) ||
    { images: a.images || [], specs: (a.specs || []).map(t => ({ t, sub: [] })), notes: [], videos: [] };
});
const allFits = PRODUCTS.flatMap(p => p.fits);
const requiredFirst = (list) => list.sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));

// ---------- vehicle + fitment ----------
function vehicleFrom(params) {
  return { make: params.get("make") || "", model: params.get("model") || "", year: params.get("year") || "" };
}
const hasVehicle = (v) => !!v.make;
function vehicleLabel(v) {
  const make = v.model.startsWith(v.make) ? "" : v.make;
  return [v.year, make, v.model].filter(Boolean).join(" ");
}
function vehicleQuery(v) {
  const q = new URLSearchParams();
  ["make", "model", "year"].forEach(k => v[k] && q.set(k, v[k]));
  const s = q.toString();
  return s ? "?" + s : "";
}
function fitsVehicle(fits, v) {
  if (!v.make) return true;
  return fits.some(([mk, md, a, b]) => mk === v.make && (!v.model || md === v.model) && (!v.year || (+v.year >= a && +v.year <= b)));
}
// does an accessory or FAQ apply to product p (optionally narrowed to vehicle v)?
function appliesTo(item, p, v = {}) {
  if (item.lines && !item.lines.includes(p.line)) return false;
  if (!item.fits.length) return true;
  return item.fits.some(([mk, md, a1, a2]) =>
    (!v.make || mk === v.make) && (!v.model || md === v.model) && (!v.year || (+v.year >= a1 && +v.year <= a2)) &&
    p.fits.some(([pmk, pmd, p1, p2]) => pmk === mk && pmd === md && a1 <= p2 && p1 <= a2));
}
function yearSpan(fits) {
  return uniq(fits.map(([mk, md, a, b]) => `${a}–${b} ${md.startsWith(mk) ? "" : mk + " "}${md}`)).join(" · ");
}

// ---------- shared UI ----------
function vehicleSelects(v, idPrefix) {
  const makes = uniq(allFits.map(f => f[0])).sort();
  const models = v.make ? uniq(allFits.filter(f => f[0] === v.make).map(f => f[1])).sort() : [];
  const years = [];
  if (v.make) allFits.filter(f => f[0] === v.make && (!v.model || f[1] === v.model)).forEach(([, , a, b]) => { for (let y = a; y <= b; y++) years.push(y); });
  const opt = (vals, sel, ph) => `<option value="">${ph}</option>` + vals.map(x => `<option${String(x) === String(sel) ? " selected" : ""}>${esc(x)}</option>`).join("");
  return `
    <div class="vsel"><label for="${idPrefix}-make">Make</label><select id="${idPrefix}-make" data-v="make">${opt(makes, v.make, "Select make")}</select></div>
    <div class="vsel"><label for="${idPrefix}-model">Model</label><select id="${idPrefix}-model" data-v="model"${models.length ? "" : " disabled"}>${opt(models, v.model, "Select model")}</select></div>
    <div class="vsel"><label for="${idPrefix}-year">Year</label><select id="${idPrefix}-year" data-v="year"${years.length ? "" : " disabled"}>${opt(uniq(years).sort((a, b) => b - a), v.year, "Any year")}</select></div>`;
}
function readSelects(root) {
  const v = {};
  root.querySelectorAll("select[data-v]").forEach(s => v[s.dataset.v] = s.value);
  return v;
}
function wireVehicleSelects(root, onChange) {
  root.querySelectorAll("select[data-v]").forEach(s => s.addEventListener("change", () => {
    const v = readSelects(root);
    if (s.dataset.v === "make") { v.model = ""; v.year = ""; }
    if (s.dataset.v === "model") v.year = "";
    onChange(v);
  }));
}

function img(src, alt, cls = "", eager = false) {
  return `<img class="${cls}" src="${esc(src || NO_PHOTO)}" alt="${esc(alt)}" loading="${eager ? "eager" : "lazy"}" onerror="this.onerror=null;this.src='${NO_PHOTO}'">`;
}
function badge(line) {
  const l = lineOf(line);
  return `<span class="lbadge" style="--line:${l.color}">${esc(l.name)}</span>`;
}
function crumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([href, label], i) =>
    i === items.length - 1 ? `<span>${esc(label)}</span>` : `<a href="${href}">${esc(label)}</a>`).join(" › ")}</nav>`;
}

function productTile(p, v) {
  return `<a class="tile" href="#/p/${p.slug}${vehicleQuery(v)}">
    <div class="tile-img">${img(p.cat.images[0], p.title)}</div>
    <div class="tile-body">
      ${badge(p.line)}
      <h3>${esc(p.title)}</h3>
      <div class="muted small">${p.cat.headline ? esc(p.cat.headline) + " · " : ""}<span class="sku">${esc(p.model)}</span></div>
      ${p.bb ? `<div class="bbsku">Best Buy SKU <strong>${esc(p.bb)}</strong></div>` : ""}
      <div class="tile-flags">${p.manual ? `<span class="flag ok">Install manual</span>` : `<span class="flag">No manual on file</span>`}${p.cat.notes.length || p.note ? `<span class="flag warn">Install notes</span>` : ""}</div>
    </div>
  </a>`;
}
function accTile(a, v) {
  return `<a class="tile" href="#/a/${encodeURIComponent(a.sku)}${vehicleQuery(v)}">
    <div class="tile-img">${img(a.cat.images[0], a.name)}</div>
    <div class="tile-body">
      <span class="lbadge" style="--line:var(--muted)">${a.required ? "Required for some installs" : "Accessory"}</span>
      <h3>${esc(a.name)}</h3>
      <div class="muted small"><span class="sku">${esc(a.bbVpn || a.sku)}</span></div>
      ${a.bb ? `<div class="bbsku">Best Buy SKU <strong>${esc(a.bb)}</strong></div>` : ""}
      <div class="muted small">${esc(a.fits.length ? yearSpan(a.fits) : "Any vehicle")}</div>
    </div>
  </a>`;
}

function faqItem(f, v, p) {
  const accLinks = (f.acc || []).filter(sku => !p || appliesTo(ACCESSORIES.find(x => x.sku === sku), p, v)).map(sku => {
    const a = ACCESSORIES.find(x => x.sku === sku);
    return `<a href="#/a/${encodeURIComponent(sku)}${vehicleQuery(v)}">${esc(a.name)}</a> <span class="sku">${esc(sku)}</span>`;
  });
  return `<details class="faq">
    <summary>${esc(f.q)}<span class="tag">${f.kind === "buy" ? "Before you buy" : "Troubleshooting"}</span></summary>
    <div class="faq-body">
      <p>${esc(f.a)}</p>
      ${f.steps ? `<ol>${f.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
      ${f.link ? `<p><a href="${f.link[0]}" target="_blank" rel="noopener">${esc(f.link[1])} ↗</a></p>` : ""}
      ${accLinks.length ? `<p>Accessories: ${accLinks.join(" · ")}</p>` : ""}
    </div>
  </details>`;
}
function firmwarePanel(f, open) {
  return `<details class="fw" style="--line:${f.color}"${open ? " open" : ""}>
    <summary>${esc(f.name)} firmware <small>· ${esc(f.asOf)}</small></summary>
    <div class="fw-body">
      <p>${esc(f.intro)}</p>
      ${f.parts.map(pt => `
        <h4>${esc(pt.h)}${pt.ver ? ` <span class="ver">${esc(pt.ver)}</span>` : ""}</h4>
        <a class="fw-dl" href="${pt.href}" target="_blank" rel="noopener">Download ${esc(pt.file)} ↗</a>
        ${pt.steps.length ? `<ol>${pt.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}`).join("")}
      <p class="muted small">Check <a href="${f.src}" target="_blank" rel="noopener">LinksWell's firmware page</a> for newer versions before updating.</p>
    </div>
  </details>`;
}
function specList(specs) {
  return `<ul class="specs">${specs.map(s => `<li>${esc(s.t)}${s.sub.length ? `<ul>${s.sub.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`;
}
function videos(ids) {
  if (!ids.length) return "";
  return `<div class="videos">${ids.map(id => `<a class="video" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">
    <img src="https://img.youtube.com/vi/${id}/hqdefault.jpg" alt="Video thumbnail" loading="lazy"><span>▶ Watch on YouTube</span></a>`).join("")}</div>`;
}
function gallery(images, alt) {
  const list = images.length ? images : [NO_PHOTO];
  return `<div class="gallery">
    <div class="gallery-main">${img(list[0], alt, "", true)}</div>
    ${list.length > 1 ? `<div class="thumbs">${list.map((s, i) => `<button type="button" class="thumb${i ? "" : " on"}" data-src="${esc(s)}" aria-label="Photo ${i + 1}">${img(s, "")}</button>`).join("")}</div>` : ""}
  </div>`;
}
function wireGallery(root) {
  root.querySelectorAll(".thumb").forEach(b => b.addEventListener("click", () => {
    $(".gallery-main img", root).src = b.dataset.src;
    root.querySelectorAll(".thumb").forEach(x => x.classList.toggle("on", x === b));
  }));
}
function sectionNav(items) {
  return `<nav class="jump">${items.filter(Boolean).map(([id, label]) => `<button type="button" data-jump="${id}">${esc(label)}</button>`).join("")}</nav>`;
}

// ---------- views ----------
const app = () => $("#app");

function viewHome() {
  document.title = "Linkswell Product Information";
  const v = { make: "", model: "", year: "" };
  const lineImg = { xl: "2015-2020-ford-f-150-2017-2022-super-duty-t-style-xl", gen6: "2015-2020-f-150-2017-2023-super-duty-generation-6-t-style-radio", lite2: "2015-2020-f-150-2017-2023-super-duty-t-style-lite-2" };
  app().innerHTML = `
    <section class="hero">
      <h1>Select your vehicle</h1>
      <form class="vbar" id="homeform">
        ${vehicleSelects(v, "h")}
        <button class="btn primary" type="submit">Show radios</button>
      </form>
    </section>
    <h2 class="h2">Shop by product line</h2>
    <div class="lines">
      ${LINES.map(l => {
        const n = PRODUCTS.filter(p => p.line === l.id).length;
        return `<a class="linecard" href="#/shop?line=${l.id}" style="--line:${l.color}">
          <div class="tile-img">${img(CATALOG[lineImg[l.id]]?.images[0], l.name)}</div>
          <div class="tile-body"><h3>${esc(LINE_FULL[l.id])}</h3><p class="muted small">${esc(LINE_BLURB[l.id])}</p><span class="small strong">${n} vehicle fits →</span></div>
        </a>`;
      }).join("")}
      <a class="linecard" href="#/shop?cat=accessories" style="--line:var(--muted)">
        <div class="tile-img">${img(ACCESSORIES.find(a => a.sku === "FDPU360ADPT").cat.images[0], "Accessories")}</div>
        <div class="tile-body"><h3>Accessories</h3><p class="muted small">Harnesses, audio and camera adapters, HDMI input and DVR camera.</p><span class="small strong">${ACCESSORIES.length} accessories →</span></div>
      </a>
    </div>
    <h2 class="h2">Support</h2>
    <div class="support-links">
      <a href="#/support" class="supcard"><strong>Firmware updates</strong><span class="muted small">Current APP, MCU and CAN box files with steps</span></a>
      <a href="#/support#faqs" class="supcard"><strong>FAQs</strong><span class="muted small">Troubleshooting and fit questions by vehicle</span></a>
    </div>`;
  const form = $("#homeform");
  const redraw = (nv) => { form.innerHTML = vehicleSelects(nv, "h") + `<button class="btn primary" type="submit">Show radios</button>`; wireVehicleSelects(form, redraw); };
  wireVehicleSelects(form, redraw);
  form.addEventListener("submit", (e) => { e.preventDefault(); location.hash = "#/shop" + vehicleQuery(readSelects(form)); });
}

function viewShop(params) {
  const v = vehicleFrom(params);
  const cat = params.get("cat") === "accessories" ? "accessories" : "radios";
  const lines = (params.get("line") || "").split(",").filter(Boolean);
  const screens = (params.get("screen") || "").split(",").filter(Boolean);
  const manualOnly = params.get("manual") === "1";
  const q = (params.get("q") || "").trim();
  const sort = params.get("sort") || "line";

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const textMatch = (hay, yearsOk) => terms.every(t => /^\d{4}$/.test(t) ? yearsOk(+t) : hay.toLowerCase().includes(t));

  // radios matching vehicle + search (before sidebar filters, for counts)
  const baseRadios = PRODUCTS.filter(p => fitsVehicle(p.fits, v) &&
    textMatch([p.title, lineOf(p.line).name, LINE_FULL[p.line], p.model, p.cat.model, p.bb, p.cat.headline, ...p.fits.map(f => f[0] + " " + f[1])].join(" "),
      y => p.fits.some(f => y >= f[2] && y <= f[3])));
  let radios = baseRadios.filter(p => (!lines.length || lines.includes(p.line)) && (!screens.length || screens.includes(p.screen)) && (!manualOnly || p.manual));
  if (sort === "screen") radios.sort((a, b) => (+b.screen || 0) - (+a.screen || 0));
  else if (sort === "year") radios.sort((a, b) => Math.max(...b.fits.map(f => f[3])) - Math.max(...a.fits.map(f => f[3])));
  else radios.sort((a, b) => LINES.findIndex(l => l.id === a.line) - LINES.findIndex(l => l.id === b.line));

  // accessories that fit this vehicle (via any matching radio)
  const vehRadios = PRODUCTS.filter(p => fitsVehicle(p.fits, v));
  let accs = ACCESSORIES.filter(a => vehRadios.some(p => appliesTo(a, p, v)) &&
    textMatch([a.name, a.sku, a.bbVpn, a.bb, a.what, ...a.fits.map(f => f[0] + " " + f[1])].join(" "), y => !a.fits.length || a.fits.some(f => y >= f[2] && y <= f[3])));
  requiredFirst(accs);
  if (lines.length) accs = accs.filter(a => PRODUCTS.some(p => lines.includes(p.line) && fitsVehicle(p.fits, v) && appliesTo(a, p, v)));

  const set = (changes) => {
    const n = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, val]) => val ? n.set(k, val) : n.delete(k));
    location.hash = "#/shop?" + n.toString();
  };
  const vlabel = vehicleLabel(v);
  const heading = (cat === "radios" ? "Radios" : "Accessories") + (vlabel ? ` for ${vlabel}` : "") + (q ? ` matching “${q}”` : "");
  document.title = heading + " · Linkswell";

  const count = (fn) => baseRadios.filter(fn).length;
  const screenVals = uniq(PRODUCTS.map(p => p.screen).filter(Boolean)).sort((a, b) => a - b);
  const check = (name, val, on, label, n) => `<label class="chk"><input type="checkbox" data-f="${name}" value="${esc(val)}"${on ? " checked" : ""}> ${esc(label)}${n != null ? ` <span class="muted">(${n})</span>` : ""}</label>`;

  app().innerHTML = `
    ${crumbs([["#/", "Home"], ["", cat === "radios" ? "Radios" : "Accessories"]])}
    <div class="vbar compact" id="shopv">${vehicleSelects(v, "s")}${hasVehicle(v) ? `<button class="btn ghost" type="button" id="clearv">Clear vehicle</button>` : ""}</div>
    <div class="plp">
      <aside class="filters">
        <details open><summary>Filters</summary>
          <div class="fgroup"><h4>Category</h4>
            <label class="chk"><input type="radio" name="cat" value="radios"${cat === "radios" ? " checked" : ""}> Radios <span class="muted">(${baseRadios.length})</span></label>
            <label class="chk"><input type="radio" name="cat" value="accessories"${cat === "accessories" ? " checked" : ""}> Accessories <span class="muted">(${accs.length})</span></label>
          </div>
          <div class="fgroup"><h4>Product line</h4>${LINES.map(l => check("line", l.id, lines.includes(l.id), l.name, count(p => p.line === l.id))).join("")}</div>
          ${cat === "radios" ? `
          <div class="fgroup"><h4>Screen size</h4>${screenVals.filter(s => screens.includes(s) || count(p => p.screen === s)).map(s => check("screen", s, screens.includes(s), s + "″", count(p => p.screen === s))).join("")}</div>
          <div class="fgroup"><h4>Downloads</h4>${check("manual", "1", manualOnly, "Has install manual", count(p => p.manual))}</div>` : ""}
          ${lines.length || screens.length || manualOnly || q ? `<button class="btn ghost small" type="button" id="clearf">Clear filters</button>` : ""}
        </details>
      </aside>
      <section class="results">
        <div class="results-head">
          <h1>${esc(heading)}</h1>
          <div class="muted small">${cat === "radios" ? radios.length : accs.length} results</div>
          ${cat === "radios" ? `<label class="sort">Sort <select id="sort">
            <option value="line"${sort === "line" ? " selected" : ""}>Product line</option>
            <option value="screen"${sort === "screen" ? " selected" : ""}>Screen size</option>
            <option value="year"${sort === "year" ? " selected" : ""}>Newest vehicles</option></select></label>` : ""}
        </div>
        ${cat === "radios" ? `
          <div class="grid">${radios.map(p => productTile(p, v)).join("") || `<p class="empty">No radios match. Try clearing filters.</p>`}</div>
          ${accs.length ? `<a class="morebar" href="#/shop?${(() => { const n = new URLSearchParams(params); n.set("cat", "accessories"); return n; })()}">${accs.length} accessories${vlabel ? " fit this vehicle" : ""} →</a>` : ""}`
        : `<div class="grid">${accs.map(a => accTile(a, v)).join("") || `<p class="empty">No accessories match.</p>`}</div>`}
      </section>
    </div>`;

  const sv = $("#shopv");
  wireVehicleSelects(sv, (nv) => set({ make: nv.make, model: nv.model, year: nv.year }));
  $("#clearv")?.addEventListener("click", () => set({ make: "", model: "", year: "" }));
  $("#clearf")?.addEventListener("click", () => set({ line: "", screen: "", manual: "", q: "" }));
  $("#sort")?.addEventListener("change", (e) => set({ sort: e.target.value === "line" ? "" : e.target.value }));
  app().querySelectorAll("input[name=cat]").forEach(r => r.addEventListener("change", () => set({ cat: r.value === "accessories" ? "accessories" : "" })));
  app().querySelectorAll("input[data-f]").forEach(c => c.addEventListener("change", () => {
    const name = c.dataset.f;
    const vals = [...app().querySelectorAll(`input[data-f=${name}]:checked`)].map(x => x.value);
    set({ [name]: vals.join(",") });
  }));
  if (matchMedia("(max-width: 760px)").matches) $(".filters details").open = false;
}

function viewProduct(slug, params) {
  const p = PRODUCTS.find(x => x.slug === slug);
  if (!p) return viewNotFound();
  const v = vehicleFrom(params);
  const c = p.cat;
  const fw = fwOf(p.fw);
  const accs = requiredFirst(ACCESSORIES.filter(a => appliesTo(a, p, v)));
  const faqs = FAQS.filter(f => appliesTo(f, p, v));
  const notes = [p.note, p.vpnNote, ...c.notes].filter(Boolean);
  const fit = hasVehicle(v) ? fitsVehicle(p.fits, v) : null;
  document.title = `${p.title} ${LINE_FULL[p.line]} · Linkswell`;

  app().innerHTML = `
    ${crumbs([["#/", "Home"], ["#/shop" + vehicleQuery(v), hasVehicle(v) ? `Radios for ${vehicleLabel(v)}` : "Radios"], ["", p.title]])}
    <div class="pdp">
      ${gallery(c.images, p.title)}
      <div class="pdp-info">
        ${badge(p.line)}
        <h1>${esc(LINE_FULL[p.line])} for ${esc(p.title)}</h1>
        <div class="muted">${p.model ? `Model <span class="sku">${esc(p.model)}</span>` : ""}${c.headline ? ` · ${esc(c.headline)}` : ""}</div>
        ${p.bb ? `<div class="bbsku big">Best Buy SKU <strong>${esc(p.bb)}</strong></div>` : ""}
        ${fit === null ? "" : fit
          ? `<div class="fitbox ok">✓ Fits ${esc(vehicleLabel(v))}</div>`
          : `<div class="fitbox no">✗ Not listed for ${esc(vehicleLabel(v))}</div>`}
        <div class="fits"><strong>Fits:</strong> ${esc(p.fits.length ? yearSpan(p.fits) : "Universal install")}</div>
        <div class="buy">
          ${p.manual ? `<a class="btn primary" href="${p.manualHref}" download>Download install manual</a>
            <a class="btn ghost" href="${p.manualHref}" target="_blank" rel="noopener">View manual</a>`
            : `<span class="muted small">No install manual on file. Check <a href="https://www.linkswellinc.com/support/install-user-manuals/" target="_blank" rel="noopener">LinksWell's manuals page</a>.</span>`}
        </div>
        ${notes.length ? `<div class="notes"><strong>Install notes</strong><ul>${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
        ${sectionNav([c.specs.length && ["specs", "Specs"], ["downloads", "Downloads"], accs.length && ["accessories", `Accessories (${accs.length})`], faqs.length && ["faqs", `FAQs (${faqs.length})`], c.videos.length && ["videos", "Videos"]])}
      </div>
    </div>

    ${c.specs.length ? `<section class="psec" id="specs"><h2>Specifications</h2>${specList(c.specs)}</section>` : ""}

    <section class="psec" id="downloads"><h2>Downloads</h2>
      <div class="dl-row">
        ${p.manual ? `<div class="dl"><div><strong>Install manual</strong><div class="muted small">PDF · ${esc(p.manual)}</div></div>
          <div class="dl-btns"><a class="btn ghost small" href="${p.manualHref}" target="_blank" rel="noopener">View</a><a class="btn primary small" href="${p.manualHref}" download>Download</a></div></div>`
          : `<div class="dl"><div><strong>Install manual</strong><div class="muted small">Not on file yet</div></div></div>`}
      </div>
      ${fw ? firmwarePanel(fw, false) : `<p class="muted small">No firmware is listed for this radio yet. Check with LinksWell.</p>`}
    </section>

    ${accs.length ? `<section class="psec" id="accessories"><h2>Accessories${hasVehicle(v) ? ` for ${esc(vehicleLabel(v))}` : ""}</h2>
      <div class="grid">${accs.map(a => accTile(a, v)).join("")}</div></section>` : ""}

    ${faqs.length ? `<section class="psec" id="faqs"><h2>FAQs</h2>
      ${[["fix", "Troubleshooting"], ["buy", "Before you buy"]].map(([k, label]) => {
        const items = faqs.filter(f => f.kind === k);
        return items.length ? `<h3>${label}</h3>` + items.map(f => faqItem(f, v, p)).join("") : "";
      }).join("")}
      <p class="muted small">From LinksWell's FAQs, reworded. Settings paths are for the current menu and may differ on Lite 2.</p></section>` : ""}

    ${c.videos.length ? `<section class="psec" id="videos"><h2>Videos</h2>${videos(c.videos)}</section>` : ""}

    ${p.url ? `<p class="muted small source">Specs and photos from <a href="${SITE + p.url}" target="_blank" rel="noopener">LinksWell's product page ↗</a></p>` : ""}`;
  wireGallery(app());
}

function viewAccessory(sku, params) {
  const a = ACCESSORIES.find(x => x.sku === sku);
  if (!a) return viewNotFound();
  const v = vehicleFrom(params);
  const c = a.cat;
  const radios = PRODUCTS.filter(p => fitsVehicle(p.fits, v) && appliesTo(a, p, v));
  const faqs = FAQS.filter(f => (f.acc || []).includes(a.sku));
  document.title = `${a.name} · Linkswell`;
  app().innerHTML = `
    ${crumbs([["#/", "Home"], ["#/shop?cat=accessories" + vehicleQuery(v).replace("?", "&"), "Accessories"], ["", a.name]])}
    <div class="pdp">
      ${gallery(c.images, a.name)}
      <div class="pdp-info">
        <span class="lbadge" style="--line:var(--muted)">${a.required ? "Required for some installs" : "Accessory"}</span>
        <h1>${esc(a.name)}</h1>
        <div class="muted">Part <span class="sku">${esc(a.bbVpn || a.sku)}</span>${a.bbVpn ? ` <span class="small">(LinksWell's site: ${esc(a.sku)})</span>` : ""}</div>
        ${a.bb ? `<div class="bbsku big">Best Buy SKU <strong>${esc(a.bb)}</strong></div>` : ""}
        <p>${esc(a.what)}</p>
        <div class="fits"><strong>Fits:</strong> ${esc(a.fits.length ? yearSpan(a.fits) : "Any vehicle")}</div>
        <div class="fits"><strong>Radios:</strong> ${esc(a.lines ? a.lines.map(id => lineOf(id).name).join(", ") + " only" : "T-Style radios (LinksWell doesn't list which generations)")}</div>
        ${a.note ? `<div class="notes"><strong>Note</strong><ul><li>${esc(a.note)}</li></ul></div>` : ""}
      </div>
    </div>
    ${c.specs.length ? `<section class="psec"><h2>Details</h2>${specList(c.specs)}</section>` : ""}
    ${radios.length ? `<section class="psec"><h2>Works with${hasVehicle(v) ? ` (${esc(vehicleLabel(v))})` : ""}</h2><div class="grid">${radios.map(p => productTile(p, v)).join("")}</div></section>` : ""}
    ${faqs.length ? `<section class="psec"><h2>Related FAQs</h2>${faqs.map(f => faqItem(f, v)).join("")}</section>` : ""}
    ${c.videos.length ? `<section class="psec"><h2>Videos</h2>${videos(c.videos)}</section>` : ""}
    ${a.url ? `<p class="muted small source">Photos from <a href="${SITE + a.url}" target="_blank" rel="noopener">LinksWell's product page ↗</a></p>`
      : a.source ? `<p class="muted small source">LinksWell has no product page for this part. ${a.photosFromSource || (a.images || []).some(u => u.includes(new URL(a.source[0]).hostname)) ? "Photos and details" : "Details"} from <a href="${a.source[0]}" target="_blank" rel="noopener">${esc(a.source[1])} ↗</a>.</p>`
      : `<p class="muted small source">LinksWell has no product page for this part, so there are no photos or specs.</p>`}`;
  wireGallery(app());
}

function viewSupport(anchor) {
  document.title = "Support · Linkswell";
  const groups = [
    ["All radios", f => !f.fits.length],
    ["Ford F-150 / Super Duty", f => f.fits.some(x => x[0] === "Ford")],
    ["Chevy Silverado / GMC Sierra (2014–18)", f => f.fits.some(x => x[0] === "Chevrolet")],
    ["Ram (2013–18 / Classic)", f => f.fits.some(x => x[0] === "Ram")],
    ["Toyota Tundra", f => f.fits.some(x => x[0] === "Toyota")],
  ];
  app().innerHTML = `
    ${crumbs([["#/", "Home"], ["", "Support"]])}
    <h1>Support</h1>
    <section class="contact">
      <h2>Tech support contact</h2>
      <a class="btn primary" href="tel:+19093750633">Call (909) 375-0633</a>
      <div class="muted small">Mon–Thurs 7 AM–4 PM PST<br>Fri 7 AM–3 PM PST</div>
    </section>
    <section class="psec" id="firmware"><h2>Firmware updates</h2>
      <p class="muted small">Gen 6 and most XL radios share one update. The 2019+ Silverado/Sierra XL has its own. Lite 2 has its own.</p>
      ${FIRMWARE.map(f => firmwarePanel(f, false)).join("")}</section>
    <section class="psec" id="faqs"><h2>FAQs</h2>
      <p class="muted small">LinksWell only publishes vehicle FAQs for F-Series, 2014–18 GM trucks, Ram and Tundra. Answers written only for Gen II–IV radios are left out.</p>
      ${groups.map(([label, fn]) => `<h3>${esc(label)}</h3>` + FAQS.filter(fn).map(f => faqItem(f, {})).join("")).join("")}</section>`;
  if (anchor) document.getElementById(anchor)?.scrollIntoView();
}

function viewNotFound() {
  app().innerHTML = `<div class="empty"><h1>Page not found</h1><p><a href="#/">Back to home</a></p></div>`;
}

// ---------- router ----------
function route() {
  const raw = location.hash.slice(1) || "/";
  const [pathPart, ...rest] = raw.split("#");
  const [path, qs] = pathPart.split("?");
  const params = new URLSearchParams(qs || "");
  const seg = path.split("/").filter(Boolean);
  if (!seg.length) viewHome();
  else if (seg[0] === "shop") viewShop(params);
  else if (seg[0] === "p") viewProduct(decodeURIComponent(seg[1] || ""), params);
  else if (seg[0] === "a") viewAccessory(decodeURIComponent(seg[1] || ""), params);
  else if (seg[0] === "support") viewSupport(rest[0]);
  else viewNotFound();
  if (seg[0] !== "support" || !rest[0]) window.scrollTo(0, 0);
  document.querySelectorAll(".topnav a").forEach(a => a.classList.toggle("on", (a.dataset.nav || "") === (seg[0] === "shop" && params.get("cat") === "accessories" ? "acc" : seg[0] || "")));
}

document.addEventListener("click", (e) => {
  const j = e.target.closest("[data-jump]");
  if (j) { document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: "smooth" }); }
});
$("#topsearch").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#topq").value.trim();
  location.hash = "#/shop" + (q ? "?q=" + encodeURIComponent(q) : "");
});
window.addEventListener("hashchange", route);
route();
