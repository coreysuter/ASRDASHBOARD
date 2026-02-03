const DATA = JSON.parse(document.getElementById('data').textContent);


window.DATA = DATA;

function renderMenuTechLists(){
  try{
    const ex = document.getElementById('menuTechListExpress');
    const ki = document.getElementById('menuTechListKia');
    if(!ex || !ki) return;

    const mk = (teamKey, el)=>{
      const list = getTechsByTeam(teamKey).slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
      el.innerHTML = list.map(t=>`<a class="menuLink menuTechLink" href="#/tech/${encodeURIComponent(t.id)}" onclick="return goTech(${JSON.stringify(t.id)})">${safe(t.name||t.id)}</a>`).join("");
    };

    mk("express", ex);
    mk("kia", ki);
  }catch(e){}
}

function fmtInt(v){ if(v===null||v===undefined||!Number.isFinite(Number(v))) return "—"; return Math.round(Number(v)).toLocaleString(); }
function fmt1(v,d=1){ if(v===null||v===undefined||!Number.isFinite(Number(v))) return "—"; return Number(v).toFixed(d); }
function fmtPct(v){ if(v===null||v===undefined||!Number.isFinite(Number(v))) return "—"; return (Number(v)*100).toFixed(1)+"%"; }
function clamp01(x){ x=Number(x); if(!Number.isFinite(x)) return 0; return Math.max(0, Math.min(1, x)); }
function miniGauge(pct){
  if(!(Number.isFinite(pct))) return "";
  const p = clamp01(pct);
  const p100 = Math.round(p*100);
  return `<span class="miniGauge" style="--p:${p100}"><span class="needle"></span></span>`;
}


function svcGauge(pct, label=""){
  // pct is a ratio vs comparison (e.g., 0.8 = 80% of benchmark). We show a ring gauge.
  const p = Number.isFinite(pct) ? Math.max(0, pct) : 0;
  const disp = Math.round(p*100);                 // text can exceed 100
  const ring = Math.round(Math.min(p, 1) * 100);  // ring fills to 100 max

  let cls = "gRed";
  if(p >= 0.80) cls = "gGreen";
  else if(p >= 0.60) cls = "gYellow";

  const lbl = String(label||"").trim();
  const textHtml = lbl
    ? `<span class="pctText pctStack"><span class="pctMain">${disp}%</span><span class="pctSub">${safe(lbl)}</span></span>`
    : `<span class="pctText">${disp}%</span>`;

  // SVG circle with r=15.915494... => circumference ≈ 100 (so we can use percent-based dash)
  return `<span class="svcGauge ${cls}" data-p="${ring}">
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <circle class="bg" cx="18" cy="18" r="15.91549430918954"></circle>
      <circle class="fg" cx="18" cy="18" r="15.91549430918954"></circle>
    </svg>
    ${textHtml}
  </span>`;
}




function animateSvcGauges(){
  const els = document.querySelectorAll('.svcGauge[data-p]');
  // set to 0 first so transition is visible, then animate to target on next frame
  els.forEach(el=>{ el.style.setProperty('--p', '0'); });
  requestAnimationFrame(()=>{
    els.forEach(el=>{
      const target = Number(el.getAttribute('data-p')||0);
      if(Number.isFinite(target)) el.style.setProperty('--p', String(Math.max(0, Math.min(100, target))));
    });
  });
}

function initSectionToggles(){
  const panels = Array.from(document.querySelectorAll(".panel"))
    .filter(p=>p.querySelector(".techH2") && p.querySelector(".list"));
  if(!panels.length) return;

  panels.forEach((p, i)=>{
    const h2 = p.querySelector(".techH2");
    if(!h2) return;

    // wrap the header line so toggle sits consistently
    const h2Wrap = document.createElement("div");
    h2Wrap.className = "secHeadRow";
    const toggle = document.createElement("div");
    toggle.className = "secToggle";
    toggle.textContent = i===0 ? "−" : "+";

    // move h2 into wrapper
    const parent = h2.parentElement;
    parent.insertBefore(h2Wrap, h2);
    h2Wrap.appendChild(toggle);
    h2Wrap.appendChild(h2);

    // default: first expanded, rest collapsed
    if(i!==0) p.classList.add("secCollapsed");

    toggle.addEventListener("click", (e)=>{
      e.preventDefault();
      const collapsed = p.classList.toggle("secCollapsed");
      toggle.textContent = collapsed ? "+" : "−";
    });
  });
}


function fmtPctPlain(v){
  if(v===null||v===undefined||v==="") return "—";
  const n = Number(v);
  if(!isFinite(n)) return "—";
  return (Math.round(n*10)/10).toFixed(1) + "%";
}

// -------------------- Goals (user-configurable) --------------------
const GOALS_STORAGE_KEY = "techDashGoals_v1";

// Goals are stored as decimal fractions (e.g., 0.30 = 30%)
function _goalKey(cat, metric){ return String(cat||"").trim() + "||" + String(metric||""); }

function loadGoals(){
  try{
    const raw = localStorage.getItem(GOALS_STORAGE_KEY);
    if(!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === "object") ? obj : {};
  }catch(e){ return {}; }
}
function saveGoals(obj){
  try{ localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(obj||{})); }catch(e){}
}

function parseGoalInput(str){
  const s = String(str||"").trim();
  if(!s) return null;
  const cleaned = s.replace(/[%\s]/g,"");
  const n = Number(cleaned);
  if(!isFinite(n)) return null;
  // If user enters 30 or 30.5 treat as percent; if 0.3 treat as fraction.
  if(n > 1) return n/100;
  if(n >= 0) return n;
  return null;
}

// Convert an input string (e.g., "30" or "0.3" or "30%") into the stored raw goal fraction.
// Kept as a separate helper because later code expects an `inputToGoal()` function.
function inputToGoal(str){
  return parseGoalInput(str);
}
function goalToInput(v){
  if(v===null||v===undefined||v===""||!isFinite(Number(v))) return "";
  return (Number(v)*100).toFixed(1).replace(/\.0$/,"");
}
function isFluidCategory(cat){
  try{
    const arr = (DATA && Array.isArray(DATA.fluid_categories)) ? DATA.fluid_categories : [];
    return arr.indexOf(String(cat)) !== -1;
  }catch(e){ return false; }
}

// Raw goal lookup (no fluids fallback)
function getGoalRaw(cat, metric){
  const goals = loadGoals();
  const v = goals[_goalKey(cat, metric)];
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// Store a *raw* goal value (already parsed as a fraction like 0.3).
// This is used by the Goals page UI to persist values directly without re-parsing.
function setGoalRaw(cat, metric, rawVal){
  const goals = loadGoals();
  const key = _goalKey(cat, metric);
  const n = Number(rawVal);
  if(rawVal===null || rawVal===undefined || rawVal==="" || !isFinite(n)){
    delete goals[key];
  }else{
    goals[key] = n;
  }
  saveGoals(goals);
}

// Effective goal lookup: fluids services fall back to universal FLUIDS goals if no override exists.
function getGoal(cat, metric){
  // Fluids apply-all override
  if(isFluidCategory(cat) && String(getGoalRaw("__META_FLUIDS","apply_all"))==="1"){
    const v = getGoalRaw("__FLUIDS_ALL", metric);
    return (v!==null && v!==undefined) ? v : null;
  }
  const raw = getGoalRaw(cat, metric);
  if(raw!==null && raw!==undefined) return raw;
  if(isFluidCategory(cat)){
    const defv = getGoalRaw("FLUIDS", metric);
    return (defv!==null && defv!==undefined) ? defv : null;
  }
  return null;
}
function setGoal(cat, metric, rawVal){
  const goals = loadGoals();
  const key = _goalKey(cat, metric);
  const parsed = parseGoalInput(rawVal);
  if(parsed===null){
    delete goals[key];
  }else{
    goals[key] = parsed;
  }
  saveGoals(goals);
}
function fmtGoal(v){
  return (v===null||v===undefined||!isFinite(Number(v))) ? "—" : fmtPct(Number(v));
}

function mean(arr){ const xs=(arr||[]).map(Number).filter(n=>Number.isFinite(n)); if(!xs.length) return null; return xs.reduce((a,b)=>a+b,0)/xs.length; }
function byTeam(team){ return (DATA.techs||[]).filter(t=>t.team===team); }
function safe(s){
  return String(s ?? "").replace(/[&<>"]/g, ch => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;"
  }[ch]));
}

// ---------- Category anchors (used for in-page jumps from summary lists) ----------
function _catAnchorId(cat){
  const base = String(cat||"").toLowerCase().trim();
  const slug = base
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return "cat_" + (slug || "x");
}
function jumpToCat(cat){
  try{
    const id = _catAnchorId(cat);
    const el = document.getElementById(id);
    if(!el) return;

    // If the service is inside a collapsed section, auto-expand it before scrolling.
    const panel = el.closest && el.closest('.panel.secCollapsed');
    if(panel){
      panel.classList.remove('secCollapsed');
      const tgl = panel.querySelector('.secToggle');
      if(tgl) tgl.textContent = '−';
    }

    el.scrollIntoView({behavior:"smooth", block:"start"});
    el.classList.remove("flash");
    // force reflow for repeat clicks
    void el.offsetWidth;
    el.classList.add("flash");
  }catch(e){}
}

function catLabel(cat){
  const map = (typeof DATA!=="undefined" && (DATA.categoryLabels || DATA.category_labels)) ? (DATA.categoryLabels || DATA.category_labels) : {};
  const raw = (map && map[cat]) ? map[cat] : (cat ?? "");
  return String(raw).replace(/_/g," ").trim();
}


function renderFiltersText(parts){
  const clean = (parts||[]).filter(Boolean).map(x=>String(x));
  const txt = "Filters: " + clean.join(", ");
  return `<span class="filtersText"><i>${safe(txt)}</i></span>`;
}


 // ===== Icons (inline SVG) =====
const ICON_FILTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 104.47 10.03l4.25 4.25 1.41-1.41-4.25-4.25A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z"/></svg>';

// ===== UI (filters open state on routed pages) =====
const UI = { groupFilters:{}, techFilters:{} };

// ===== Technician search modal =====
function renderTechSearchResults(q){
  const list = (DATA.techs||[]).slice();
  const needle = (q||"").toLowerCase().trim();
  const matches = needle ? list.filter(t => (t.name||"").toLowerCase().includes(needle)) : list;
  matches.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  const out = matches.slice(0, 80).map(t=>{
    const team = t.team || "";
    return `<a class="resItem" href="#/tech/${encodeURIComponent(t.id)}" onclick="closeTechSearch(); return goTech(${JSON.stringify(t.id)})">
      <span>${safe(t.name || t.id)}</span>
      <span class="resBadge">${safe(team)}</span>
    </a>`;
  }).join("") || `<div class="notice">No matches.</div>`;
  const box = document.getElementById("techSearchResults");
  if(box) box.innerHTML = out;
}

function openTechSearch(prefill=""){
  const m = document.getElementById("techSearchModal");
  const inp = document.getElementById("techSearchInput");
  if(!m || !inp) return;
  m.classList.add("open");
  inp.value = prefill || "";
  renderTechSearchResults(inp.value);
  setTimeout(()=>inp.focus(), 0);
}

function closeTechSearch(){
  const m = document.getElementById("techSearchModal");
  if(m) m.classList.remove("open");
}

function initTechSearchModal(){
  const m = document.getElementById("techSearchModal");
  const inp = document.getElementById("techSearchInput");
  if(!m || !inp) return;

  // click outside closes
  m.addEventListener("click", (e)=>{
    if(e.target === m) closeTechSearch();
  });

  inp.addEventListener("input", ()=> renderTechSearchResults(inp.value));
  inp.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){ e.preventDefault(); closeTechSearch(); }
  });

  window.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") closeTechSearch();
    // Quick open (Ctrl/Cmd+K)
    if((e.ctrlKey || e.metaKey) && (e.key||"").toLowerCase() === "k"){
      e.preventDefault();
      openTechSearch();
    }
  });
}

function techAsrPerRo(t, filterKey){
  const v=Number(t?.summary?.[filterKey]?.asr_per_ro);
  return Number.isFinite(v)?v:null;
}
function techSoldPct(t, filterKey){
  const v=Number(t?.summary?.[filterKey]?.sold_pct);
  return Number.isFinite(v)?v:null;
}
function teamAsrPerRo(teamTechs, filterKey){
  let asr=0, ros=0;
  for(const t of (teamTechs||[])){
    const r=Number(t.ros);
    const a=Number(t?.summary?.[filterKey]?.asr);
    if(Number.isFinite(r) && r>0) ros+=r;
    if(Number.isFinite(a)) asr+=a;
  }
  return ros>0 ? (asr/ros) : null;
}
function teamAverages(teamTechs, filterKey){
  return {
    ros_avg: mean(teamTechs.map(t=>t.ros)),
    odo_avg: mean(teamTechs.map(t=>t.odo)),
    asr_total_avg: mean(teamTechs.map(t=>t.summary?.[filterKey]?.asr)),
    asr_per_ro_avg: teamAsrPerRo(teamTechs, filterKey),
    sold_pct_avg: mean(teamTechs.map(t=>techSoldPct(t, filterKey))),
    sold_avg: mean(teamTechs.map(t=>t.summary?.[filterKey]?.sold)),
  };
}

function renderTeam(team, st){
  const techs=byTeam(team);
  const av=teamAverages(techs, st.filterKey);

  const list=techs.slice();
  list.sort((a,b)=>{
    const na = st.sortBy==="sold_pct" ? Number(techSoldPct(a, st.filterKey)) : Number(techAsrPerRo(a, st.filterKey));
    const nb = st.sortBy==="sold_pct" ? Number(techSoldPct(b, st.filterKey)) : Number(techAsrPerRo(b, st.filterKey));
    return (Number.isFinite(nb)?nb:-999) - (Number.isFinite(na)?na:-999);
  });

  // ranking follows the selected Focus (ASR/RO or Sold%)
  const ranked = list.slice().sort((a,b)=>{
    const na = st.sortBy==="sold_pct" ? Number(techSoldPct(a, st.filterKey)) : Number(techAsrPerRo(a, st.filterKey));
    const nb = st.sortBy==="sold_pct" ? Number(techSoldPct(b, st.filterKey)) : Number(techAsrPerRo(b, st.filterKey));
    return (Number.isFinite(nb)?nb:-999) - (Number.isFinite(na)?na:-999);
  });
  const rankIndex = new Map();
  ranked.forEach((t,i)=>rankIndex.set(t.id, {rank:i+1,total:ranked.length}));

  const rows=list.map(t=>{
    const s=(t.summary && t.summary[st.filterKey]) ? t.summary[st.filterKey] : {};
    const rk = rankIndex.get(t.id) || {rank:null,total:null};
    const asrpr = techAsrPerRo(t, st.filterKey);
    const soldpct = techSoldPct(t, st.filterKey);

    return `
      <div class="techRow">
        <div class="techMeta" style="align-items:flex-start">
          <div class="techMetaLeft">
            <div class="val name" style="font-size:16px">
              <a href="#/tech/${encodeURIComponent(t.id)}" style="text-decoration:none;color:inherit" onclick="return goTech(${JSON.stringify(t.id)})">${safe(t.name)}</a>
            </div>
            <div class="rankUnder">${rk.rank??"—"} of ${rk.total??"—"}<div class="byAsr">${st.sortBy==="sold_pct"?"Sold%":"ASR/RO"}</div></div>
          </div>

        </div>

        <div class="techTiles">
          <div class="techTile tE"><div class="tLbl">ROs</div><div class="tVal">${fmtInt(t.ros)}</div></div>
          <div class="techTile tA"><div class="tLbl">Avg ODO</div><div class="tVal">${fmtInt(t.odo)}</div></div>
          <div class="techTile tC"><div class="tLbl">Total ASR</div><div class="tVal">${fmtInt(s.asr)}</div></div>
          <div class="techTile tB"><div class="tLbl">Sold</div><div class="tVal">${fmtInt(s.sold)}</div></div>
          <div class="techTile tD"><div class="tLbl">${st.sortBy==="sold_pct" ? "Sold%" : "ASR/RO"}</div><div class="tVal">${st.sortBy==="sold_pct" ? fmtPct(soldpct) : fmt1(asrpr,1)}</div></div>
        </div>
      </div>
    `;
  }).join("");

  const filterLabel = st.filterKey==="without_fluids" ? "Without Fluids" : (st.filterKey==="fluids_only" ? "Fluids Only" : "With Fluids (Total)");

  const appliedParts = [
    `${filterLabel}`,
    (st.sortBy==="sold_pct" ? "Focus: Sold%" : "Focus: ASR/RO")
  ];
  const appliedTextHtml = renderFiltersText(appliedParts);


  return `
    <div class="panel techHeaderPanel">
      <div class="phead">
        <div class="titleRow">
          <div>
            <div class="h2 teamTitle">${safe(team)}</div>
            <div class="sub"></div>
          </div>
          <div class="teamStat">
            <div class="num">${st.sortBy==="sold_pct" ? fmtPct(av.sold_pct_avg) : fmt1(av.asr_per_ro_avg,1)}</div>
            <div class="lbl">${st.sortBy==="sold_pct" ? "Sold%" : "Avg ASR/RO (Summary)"}</div>
          </div>
        </div>

        <div class="pills">
          <div class="pill"><div class="k">Avg ROs</div><div class="v">${fmtInt(av.ros_avg)}</div></div>
          <div class="pill"><div class="k">Avg ODO</div><div class="v">${fmtInt(av.odo_avg)}</div></div>
          <div class="pill"><div class="k">Total ASR</div><div class="v">${fmtInt(av.asr_total_avg)}</div></div>
          <div class="pill"><div class="k">${st.sortBy==="sold_pct" ? "ASR/RO" : "Sold %"}</div><div class="v">${st.sortBy==="sold_pct" ? fmt1(av.asr_per_ro_avg,1) : fmtPct(av.sold_pct_avg)}</div></div>
        </div>
        <div class="iconBar">
          <button class="iconBtn" onclick="toggleTeamFilters('${safe(team)}')" aria-label="Filters" title="Filters">${ICON_FILTER}</button>
          <div class="appliedInline">${appliedTextHtml}</div>
          <button class="iconBtn pushRight" onclick="openTechSearch()" aria-label="Search" title="Search">${ICON_SEARCH}</button>
        </div>

        <div class="ctlPanel ${st.filtersOpen?"open":""}">
          <div class="controls">
            <div>
              <label>Filter</label>
              <select data-team="${safe(team)}" data-ctl="filter">
                <option value="total" ${st.filterKey==="total"?"selected":""}>With Fluids (Total)</option>
                <option value="without_fluids" ${st.filterKey==="without_fluids"?"selected":""}>Without Fluids</option>
                <option value="fluids_only" ${st.filterKey==="fluids_only"?"selected":""}>Fluids Only</option>
              </select>
            </div>
            <div>
              <label>Focus</label>
              <select data-team="${safe(team)}" data-ctl="sort">
                <option value="asr_per_ro" ${st.sortBy==="asr_per_ro"?"selected":""}>ASR/RO (default)</option>
                <option value="sold_pct" ${st.sortBy==="sold_pct"?"selected":""}>Sold%</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="list">${rows || `<div class="notice">No technicians found.</div>`}</div>
    </div>
  `;
}

const state = {
  EXPRESS: {filterKey:"total", sortBy:"asr_per_ro", filtersOpen:false},
  KIA: {filterKey:"total", sortBy:"asr_per_ro", filtersOpen:false},
};

function toggleTeamFilters(team){
  if(!state[team]) return;
  state[team].filtersOpen = !state[team].filtersOpen;
  renderMain();
}

function toggleGroupFilters(groupKey){
  UI.groupFilters[groupKey] = !UI.groupFilters[groupKey];
  renderGroupPage(groupKey);
}

function toggleTechFilters(techId){
  UI.techFilters[techId] = !UI.techFilters[techId];
  renderTech(techId);
}


function renderMain(){
  const app=document.getElementById('app');
  app.innerHTML = `<div class="teamsGrid">${renderTeam("EXPRESS", state.EXPRESS)}${renderTeam("KIA", state.KIA)}</div>`;

  document.querySelectorAll('[data-ctl]').forEach(el=>{
    const team=el.getAttribute('data-team');
    const ctl=el.getAttribute('data-ctl');
    const st=state[team];
    const apply=()=>{
      if(ctl==="filter") st.filterKey=el.value;
      if(ctl==="sort") st.sortBy=el.value;
      if(ctl==="search") st.search=el.value;
      renderMain();
    };
    el.addEventListener('change', apply);
    el.addEventListener('input', apply);
  });
}

function buildTeamCategoryStats(team){
  const techs = byTeam(team);
  const stats = {}; // cat -> {avgReq, topReq, topTech, avgClose}
  const cats = new Set();
  for(const t of techs){
    for(const k of Object.keys(t.categories||{})) cats.add(k);
  }
  for(const cat of cats){
    const reqs=[], closes=[];
    let topReq=-1, topTech=null;
    for(const t of techs){
      const c=t.categories?.[cat];
      const req=Number(c?.req);
      if(Number.isFinite(req)){
        reqs.push(req);
        if(req>topReq){ topReq=req; topTech=t.name; }
      }
      const cl=Number(c?.close);
      if(Number.isFinite(cl)) closes.push(cl);
    }
    stats[cat]={
      avgReq: reqs.length ? reqs.reduce((a,b)=>a+b,0)/reqs.length : null,
      topReq: topReq>=0 ? topReq : null,
      topTech,
      avgClose: closes.length ? closes.reduce((a,b)=>a+b,0)/closes.length : null,
    };
  }
  return stats;
}

function bandClass(val, base){
    if(!(Number.isFinite(val) && Number.isFinite(base) && base>0)) return "";
    const pct = val/base;
    if(pct>=0.80) return "bGreen";
    if(pct>=0.60) return "bYellow";
    return "bRed";
  }function renderROListForTech(techId, query){
  const t = (DATA.techs||[]).find(x=>x.id===techId);
  const ros = (DATA.ros_by_tech||{})[techId] || [];
  const q = (query||"").toLowerCase().trim();

  const filtered = !q ? ros : ros.filter(r=>{
    const a = (r.sold_text||"").toLowerCase();
    const b = (r.unsold_text||"").toLowerCase();
    return a.includes(q) || b.includes(q);
  });

  const rows = filtered.map(r=>`
    <div class="techRow">
      <div class="rowGrid" style="grid-template-columns: 1.2fr 1fr 1fr 1fr;gap:10px">
        <div class="cell"><span class="lbl">RO#</span><span class="val">${safe(r.ro||"—")}</span></div>
        <div class="cell"><span class="lbl">RO Date</span><span class="val">${safe(r.ro_date||"—")}</span></div>
        <div class="cell"><span class="lbl">Miles</span><span class="val">${fmtInt(r.miles)}</span></div>
        <div class="cell"><span class="lbl">Hrs</span><span class="val">${fmt1(r.hrs,1)}</span></div>
      </div>
      <div style="margin-top:8px;color:var(--muted);font-size:12px;line-height:1.35">
        <div><b>Sold:</b> ${safe(r.sold_text||"")}</div>
        <div><b>Unsold:</b> ${safe(r.unsold_text||"")}</div>
      </div>
    </div>
  `).join("");

  document.getElementById('app').innerHTML = `
    <div class="panel">
      <div class="phead">
        <div class="titleRow">
          <div>
            <div class="h2">ROs • ${safe(t?.name||"Unknown")}</div>
            <div class="sub"><a href="#/tech/${encodeURIComponent(techId)}" style="text-decoration:none">← Back to technician</a></div>
          </div>
          <div style="text-align:right">
            <div class="big">${filtered.length.toLocaleString()}</div>
            <div class="tag">Matching ROs</div>
          </div>
        </div>
        <div class="sub" style="margin-top:10px">Filter term: <b>${safe(query||"(none)")}</b> (matches Sold/Unsold lines text)</div>
      </div>
      <div class="list">${rows || `<div class="notice">No ROs matched this category term.</div>`}</div>
    </div>
  `;
}

function renderTech(techId){
  const t = (DATA.techs||[]).find(x=>x.id===techId);
  if(!t){
    document.getElementById('app').innerHTML = `<div class="panel"><div class="phead"><div class="h2">Technician not found</div><div class="sub"><a href="#/">Back</a></div></div></div>`;
    return;
  }

  const team = t.team;

  const logoSrc = (document.querySelector(".brandLogo")||{}).src || "";

  let filterKey = "total";
  let compareBasis = "team";
  let focus = "asr"; // asr | sold
const hash = location.hash || "";
  const qs = hash.includes("?") ? hash.split("?")[1] : "";
  if(qs){
    for(const part of qs.split("&")){
      const [k,v]=part.split("=");
      if(k==="filter") filterKey = decodeURIComponent(v||"") || "total";
      if(k==="compare"){
        const vv = decodeURIComponent(v||"") || "team";
        compareBasis = (vv==="store") ? "store" : "team";
      }
      if(k==="focus"){
        const vv = decodeURIComponent(v||"") || "asr";
        focus = (vv==="sold"||vv==="goal"||vv==="asr") ? vv : "asr";
      }
    }
  }
  function filterLabel(k){ return k==="without_fluids"?"Without Fluids":(k==="fluids_only"?"Fluids Only":"With Fluids (Total)"); }

  const s = t.summary?.[filterKey] || {};

  function allTechs(){ return (DATA.techs||[]).filter(x=>x.team==="EXPRESS" || x.team==="KIA"); }
  function categoryUniverse(){
    const cats=new Set();
    for(const x of (DATA.techs||[])){
      for(const k of Object.keys(x.categories||{})) cats.add(k);
    }
    return Array.from(cats);
  }
  const CAT_LIST = categoryUniverse();

  function buildBench(scopeTechs){
    const bench={};
    for(const cat of CAT_LIST){
      const reqs=[], closes=[];
      let topReq=-1, topName="—", topClose=null;
      for(const x of scopeTechs){
        const c=x.categories?.[cat];
        const req=Number(c?.req);     // treat as ASR/RO
        const close=Number(c?.close); // treat as Sold%
        if(Number.isFinite(req)) reqs.push(req);
        if(Number.isFinite(close)) closes.push(close);
        if(Number.isFinite(req) && req>topReq){
          topReq=req; topName=x.name||"—";
          topClose=Number.isFinite(close)?close:null;
        }
      }
      bench[cat]={
        avgReq: reqs.length? reqs.reduce((a,b)=>a+b,0)/reqs.length : null,
        avgClose: closes.length? closes.reduce((a,b)=>a+b,0)/closes.length : null,
        topReq: topReq>=0? topReq : null,
        topClose, topName
      };
    }
    return bench;
  }

  const TEAM_TECHS = byTeam(team);
  const STORE_TECHS = allTechs();
  const TEAM_B = buildBench(TEAM_TECHS);
  const STORE_B = buildBench(STORE_TECHS);

  // Benchmarks helpers (tech detail)
  // TEAM_B / STORE_B are computed above from the current comparison team and full store tech list.
  function getTeamBenchmarks(cat, _team){
    try{ return (TEAM_B && TEAM_B[cat]) ? TEAM_B[cat] : {}; }catch(e){ return {}; }
  }
  function getStoreBenchmarks(cat){
    try{ return (STORE_B && STORE_B[cat]) ? STORE_B[cat] : {}; }catch(e){ return {}; }
  }


  function bandClass(val, base){
    if(!(Number.isFinite(val) && Number.isFinite(base) && base>0)) return "";
    const pct = val/base;
    if(pct>=0.80) return "bGreen";
    if(pct>=0.60) return "bYellow";
    return "bRed";
  }

  function rankFor(cat){
    const CMP_TECHS = (compareBasis==="team") ? TEAM_TECHS : STORE_TECHS;
    const vals = CMP_TECHS
      .map(x=>{
        const c = x.categories?.[cat] || {};
        let v = NaN;
        if(focus==="sold"){
          v = Number(c.close);
        }else if(focus==="goal"){
          const req = Number(c.req ?? NaN);
          const close = Number(c.close ?? NaN);
          const gReq = Number(getGoal(cat,"req"));
          const gClose = Number(getGoal(cat,"close"));
          const parts = [];
          if(Number.isFinite(req) && Number.isFinite(gReq) && gReq>0) parts.push(req/gReq);
          if(Number.isFinite(close) && Number.isFinite(gClose) && gClose>0) parts.push(close/gClose);
          v = parts.length ? (parts.reduce((a,b)=>a+b,0)/parts.length) : NaN;
        }else{
          v = Number(c.req);
        }
        return {id:x.id, v};
      })
      .filter(o=>Number.isFinite(o.v))
      .sort((a,b)=>b.v-a.v);

    const meC = t.categories?.[cat] || {};
    let me = NaN;
    if(focus==="sold"){
      me = Number(meC.close);
    }else if(focus==="goal"){
      const req = Number(meC.req);
      const close = Number(meC.close);
      const gReq = Number(getGoal(cat,"req"));
      const gClose = Number(getGoal(cat,"close"));
      const parts = [];
      if(Number.isFinite(req) && Number.isFinite(gReq) && gReq>0) parts.push(req/gReq);
      if(Number.isFinite(close) && Number.isFinite(gClose) && gClose>0) parts.push(close/gClose);
      me = parts.length ? (parts.reduce((a,b)=>a+b,0)/parts.length) : NaN;
    }else{
      me = Number(meC.req);
    }

    if(!Number.isFinite(me) || !vals.length) return null;
    const idx = vals.findIndex(o=>o.id===t.id);
    return {rank: idx>=0?idx+1:null, total: vals.length};
  }
const tfOpen = !!UI.techFilters[techId];
  const appliedParts = [
    `${filterLabel(filterKey)}`,
    (compareBasis==="team" ? `Compare: ${team}` : "Compare: Store"),
    (focus==="sold" ? "Focus: Sold" : (focus==="goal" ? "Focus: Goal" : "Focus: ASR/RO"))
  ];
  const appliedTextHtml = renderFiltersText(appliedParts);


  const filters = `
    <div class="iconBar" style="margin-top:0">
      <button class="iconBtn" onclick="toggleTechFilters('${safe(techId)}')" aria-label="Filters" title="Filters">${ICON_FILTER}</button>
      <div class="appliedInline">${appliedTextHtml}</div>
    </div>
    <div class="ctlPanel ${tfOpen?"open":""}">
      <div class="controls" style="margin-top:10px">
        <div>
          <label>Summary Filter</label>
          <select id="techFilter">
            <option value="total" ${filterKey==="total"?"selected":""}>With Fluids (Total)</option>
            <option value="without_fluids" ${filterKey==="without_fluids"?"selected":""}>Without Fluids</option>
            <option value="fluids_only" ${filterKey==="fluids_only"?"selected":""}>Fluids Only</option>
          </select>
        </div>
        <div>
          <label>Comparison</label>
          <select id="compareBasis">
            <option value="team" ${compareBasis==="team"?"selected":""}>Team</option>
            <option value="store" ${compareBasis==="store"?"selected":""}>Store</option>
          </select>
        </div>
        <div>
          <label>Focus</label>
          <select id="techFocus">
            <option value="asr" ${focus==="asr"?"selected":""}>ASR/RO</option>
            <option value="sold" ${focus==="sold"?"selected":""}>Sold%</option>
            <option value="goal" ${focus==="goal"?"selected":""}>Goal</option>
          </select>
        </div>
      </div>
    </div>
  `;

  const scopeTechs = (compareBasis==="team") ? byTeam(team) : allTechs();
  function techGoalScore(x){
    let sum=0, n=0;
    for(const cat of CAT_LIST){
      const c = x.categories?.[cat];
      if(!c) continue;
      const req = Number(c.req ?? NaN);
      const close = Number(c.close ?? NaN);
      const gReq = Number(getGoal(cat,"req"));
      const gClose = Number(getGoal(cat,"close"));
      if(Number.isFinite(req) && Number.isFinite(gReq) && gReq>0){ sum += (req/gReq); n++; }
      if(Number.isFinite(close) && Number.isFinite(gClose) && gClose>0){ sum += (close/gClose); n++; }
    }
    return n ? (sum/n) : null; // ratio (1.0 = 100% of goal)
  }
  const metricForRank = (x)=> {
    if(focus==="sold") return Number(techSoldPct(x, filterKey));
    if(focus==="goal") return Number(techGoalScore(x));
    return Number(techAsrPerRo(x, filterKey));
  };
  const ordered = scopeTechs.slice().sort((a,b)=>{
    const nb = metricForRank(b);
    const na = metricForRank(a);
    return (Number.isFinite(nb)?nb:-999) - (Number.isFinite(na)?na:-999);
  });

  const myV = metricForRank(t);
  const idx = Number.isFinite(myV) ? ordered.findIndex(o=>o.id===t.id) : -1;
  const overall = ordered.length ? {rank: (idx>=0?idx+1:null), total: ordered.length} : {rank:null,total:null};
  const focusLbl = focus==="sold" ? "SOLD%" : (focus==="goal" ? "GOAL%" : "ASR/RO");
  const focusVal = focus==="sold" ? fmtPct(techSoldPct(t, filterKey)) : (focus==="goal" ? fmtPct(techGoalScore(t)) : fmt1(techAsrPerRo(t, filterKey),1));

  // ----- Top/Bottom services (for the new quick box on tech detail header) -----
  function buildServiceExtremes(metric){
    // metric: "asr" | "sold"
    const rows = CAT_LIST.map(cat=>{
      const c = t.categories?.[cat] || {};
      const asr = Number(c.asr ?? 0);
      const sold = Number(c.sold ?? 0);
      const req = Number(c.req ?? NaN);     // ratio (0..1) shown as percent
      const close = Number(c.close ?? NaN); // ratio (0..1) shown as percent
      return {
        cat,
        val: metric==="sold" ? sold : asr,
        pct: metric==="sold" ? close : req
      };
    });
    const clean = rows.filter(r=>r.cat && Number.isFinite(r.val) && (r.val>=0));
    const top = clean.slice().sort((a,b)=> (b.val-a.val) || ((b.pct||0)-(a.pct||0)) ).slice(0,3);
    const bot = clean.slice().sort((a,b)=> (a.val-b.val) || ((a.pct||0)-(b.pct||0)) ).slice(0,3);
    return {top, bot};
  }

  function renderSvcLine(r, kind){
    // kind: "asr" | "sold"
    if(!r) return "";
    const label = kind==="sold" ? "Sold" : "ASR";
    const pctTxt = fmtPct(r.pct);
    const valTxt = fmtInt(r.val);
    return `
      <button class="svcJump" type="button" onclick='jumpToCat(${JSON.stringify(r.cat)})'>
        <span class="svcName">${safe(catLabel(r.cat))}</span>
        <span class="svcNums">${label} ${safe(valTxt)} • ${safe(pctTxt)}</span>
      </button>
    `;
  }

  const asrExt = buildServiceExtremes("asr");
  const soldExt = buildServiceExtremes("sold");

  
const header = `
    <div class="panel techHeaderPanel">
      <div class="phead">
        <div class="titleRow techTitleRow">
          <div class="techTitleLeft">
            <label for="menuToggle" class="hamburgerMini" aria-label="Menu">☰</label>
          </div>
          <div class="techNameWrap">
            <div class="h2 techH2Big">${safe(t.name)}</div>
            <div class="techTeamLine">${safe(team)}</div>
          </div>
          <div class="techQuickBox" aria-label="Top and bottom services">
            <div class="quickGrid">
              <div class="quickCol">
                <div class="quickHdr">ASR%</div>
                <div class="quickLbl">TOP 3 MOST RECOMMENDED</div>
                <div class="quickList">
                  ${asrExt.top.map(r=>renderSvcLine(r,"asr")).join("") || `<div class="quickEmpty">—</div>`}
                </div>
                <div class="quickLbl" style="margin-top:10px">BOTTOM 3 LEAST RECOMMENDED</div>
                <div class="quickList">
                  ${asrExt.bot.map(r=>renderSvcLine(r,"asr")).join("") || `<div class="quickEmpty">—</div>`}
                </div>
              </div>
              <div class="quickCol">
                <div class="quickHdr">SOLD%</div>
                <div class="quickLbl">TOP 3 MOST RECOMMENDED</div>
                <div class="quickList">
                  ${soldExt.top.map(r=>renderSvcLine(r,"sold")).join("") || `<div class="quickEmpty">—</div>`}
                </div>
                <div class="quickLbl" style="margin-top:10px">BOTTOM 3 LEAST RECOMMENDED</div>
                <div class="quickList">
                  ${soldExt.bot.map(r=>renderSvcLine(r,"sold")).join("") || `<div class="quickEmpty">—</div>`}
                </div>
              </div>
            </div>
          </div>
          <div class="overallBlock">
            <div class="big">${overall.rank ?? "—"}/${overall.total ?? "—"}</div>
            <div class="tag">${focus==="sold" ? "Overall Sold Rank" : "Overall ASR Rank"}</div>
            <div class="overallMetric">${focusVal}</div>
            <div class="tag">${focus==="sold" ? "Sold%" : "Total ASR/RO"}</div>
          </div>
        </div>
        <div class="pills">
          <div class="pill"><div class="k">ROs</div><div class="v">${fmtInt(t.ros)}</div></div>
          <div class="pill"><div class="k">Avg ODO</div><div class="v">${fmtInt(t.odo)}</div></div>
          <div class="pill"><div class="k">Avg ASR/RO</div><div class="v">${fmt1(techAsrPerRo(t, filterKey),1)}</div></div>
          <div class="pill"><div class="k">Sold %</div><div class="v">${fmtPct(techSoldPct(t, filterKey))}</div></div>
        </div>
        ${filters}
      </div>
    </div>
  `;

  function fmtDelta(val){ return val===null || val===undefined || !Number.isFinite(Number(val)) ? "—" : (Number(val)*100).toFixed(1); }

  function renderCategoryRectSafe(cat, compareBasis){
    const c = (t.categories && t.categories[cat]) ? t.categories[cat] : {};
    const asrCount = Number(c.asr ?? 0);
    const soldCount = Number(c.sold ?? 0);
    const req = Number(c.req ?? NaN);
    const close = Number(c.close ?? NaN);
    const ro = Number(c.ro ?? 0);

        const techRos = Number(t.ros ?? 0);
const tb = getTeamBenchmarks(cat, team) || {};
    const sb = getStoreBenchmarks(cat) || {};
    const basis = (compareBasis==="store") ? sb : tb;

    const goalReq = Number(getGoal(cat,"req"));
    const goalClose = Number(getGoal(cat,"close"));

    const cmpReq = Number(basis.avgReq);
    const cmpClose = Number(basis.avgClose);

    const pctGoalReq = (Number.isFinite(req) && Number.isFinite(goalReq) && goalReq>0) ? (req/goalReq) : NaN;
    const pctGoalClose = (Number.isFinite(close) && Number.isFinite(goalClose) && goalClose>0) ? (close/goalClose) : NaN;

    const pctCmpReq = (Number.isFinite(req) && Number.isFinite(cmpReq) && cmpReq>0) ? (req/cmpReq) : NaN;
    const pctCmpClose = (Number.isFinite(close) && Number.isFinite(cmpClose) && cmpClose>0) ? (close/cmpClose) : NaN;

    function bandClass(pct){
      if(!Number.isFinite(pct)) return "bandNeutral";
      if(pct >= 0.80) return "bandGood";
      if(pct >= 0.60) return "bandWarn";
      return "bandBad";
    }

    // Header gauge follows Focus:
    let hdrPct = pctCmpReq;
    if(focus==="sold") hdrPct = pctCmpClose;
    if(focus==="goal"){
      const parts = [];
      if(Number.isFinite(pctGoalReq)) parts.push(pctGoalReq);
      if(Number.isFinite(pctGoalClose)) parts.push(pctGoalClose);
      hdrPct = parts.length ? (parts.reduce((a,b)=>a+b,0)/parts.length) : NaN;
    }
    const gaugeHtml = Number.isFinite(hdrPct) ? `<div class="svcGaugeWrap" style="--sz:72px">${svcGauge(hdrPct, (focus==="sold"?"Sold%":(focus==="goal"?"Goal%":"ASR%")))}</div>
` : `<div class="svcGaugeWrap" style="--sz:72px"></div>`;

    const rk = rankFor(cat);

    const showFocusTag = (focus==="sold") ? "SOLD%" : (focus==="goal" ? "GOAL%" : "ASR/RO");

    const compareLabel = (compareBasis==="store") ? "Store Avg" : "Team Avg";

    const asrBlock = `
      <div class="metricBlock">
        <div class="mbLeft">
          <div class="mbKicker">ASR/RO%</div>
          <div class="mbStat ${bandClass(pctCmpReq)}">${fmtPct(req)}</div>
        </div>
        <div class="mbRight">
          ${(focus==="goal") ? `
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">Goal</div>
              <div class="mbNum">${fmtPct(goalReq)}</div>
            </div>
            <div class="mbGauge" style="--sz:56px">${Number.isFinite(pctGoalReq)? svcGauge(pctGoalReq):""}</div>
          </div>
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">${compareLabel}</div>
              <div class="mbNum">${fmtPct(cmpReq)}</div>
            </div>
            <div class="mbGauge" style="--sz:56px">${Number.isFinite(pctCmpReq)? svcGauge(pctCmpReq):""}</div>
          </div>
          ` : `
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">${compareLabel}</div>
              <div class="mbNum">${fmtPct(cmpReq)}</div>
            </div>
            <div class="mbGauge" style="--sz:56px">${Number.isFinite(pctCmpReq)? svcGauge(pctCmpReq):""}</div>
          </div>
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">Goal</div>
              <div class="mbNum">${fmtPct(goalReq)}</div>
            </div>
            <div class="mbGauge" style="--sz:56px">${Number.isFinite(pctGoalReq)? svcGauge(pctGoalReq):""}</div>
          </div>
          `}
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">Top Performer</div>
              <div class="mbSub">(${safe((basis.topName)||"—")})</div>
              <div class="mbNum">${fmtPct(basis.topReq)}</div>
            </div>
          </div>
        </div>
      </div>
    `;

const soldBlock = `
      <div class="metricBlock">
        <div class="mbLeft">
          <div class="mbKicker">Sold%</div>
          <div class="mbStat ${bandClass(pctCmpClose)}">${fmtPct(close)}</div>
        </div>
        <div class="mbRight">
          ${(focus==="goal") ? `
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">Goal</div>
              <div class="mbNum">${fmtPct(goalClose)}</div>
            </div>
            <div class="mbGauge" style="--sz:56px">${Number.isFinite(pctGoalClose)? svcGauge(pctGoalClose):""}</div>
          </div>
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">${compareLabel}</div>
              <div class="mbNum">${fmtPct(cmpClose)}</div>
            </div>
            <div class="mbGauge" style="--sz:56px">${Number.isFinite(pctCmpClose)? svcGauge(pctCmpClose):""}</div>
          </div>
          ` : `
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">${compareLabel}</div>
              <div class="mbNum">${fmtPct(cmpClose)}</div>
            </div>
            <div class="mbGauge" style="--sz:56px">${Number.isFinite(pctCmpClose)? svcGauge(pctCmpClose):""}</div>
          </div>
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">Goal</div>
              <div class="mbNum">${fmtPct(goalClose)}</div>
            </div>
            <div class="mbGauge" style="--sz:56px">${Number.isFinite(pctGoalClose)? svcGauge(pctGoalClose):""}</div>
          </div>
          `}
          <div class="mbRow">
            <div class="mbItem">
              <div class="mbLbl">Top Performer</div>
              <div class="mbSub">(${safe((basis.topCloseName)||basis.topName||"—")})</div>
              <div class="mbNum">${fmtPct(basis.topClose)}</div>
            </div>
          </div>
        </div>
      </div>
    `;

return `
      <div class="catCard" id="${_catAnchorId(cat)}">
        <div class="catHeader">
          <div class="svcGaugeWrap" style="--sz:72px">${Number.isFinite(hdrPct)? svcGauge(hdrPct, (focus==="sold"?"Sold%":(focus==="goal"?"Goal%":"ASR%"))) : ""}</div>
<div>
            <div class="catTitle">${safe(catLabel(cat))}</div>
            <div class="muted svcMetaLine" style="margin-top:2px">
              ${fmt1(asrCount,0)} ASR · ${fmt1(soldCount,0)} Sold · ${fmt1(techRos,0)} ROs
            </div>
          </div>
          <div class="catRank">
            <div class="rankNum">${rk && rk.rank ? rk.rank : "—"}${rk && rk.total ? `<span class="rankDen">/${rk.total}</span>`:""}</div>
            <div class="rankLbl">${focus==="sold"?"SOLD%":(focus==="goal"?"GOAL%":"ASR%")}</div>
          </div>
        </div>

        <div class="metricStack">
          ${asrBlock}
          ${soldBlock}
        </div>

        <div class="catFooter">
          <a class="linkPill" href="#/raw?tech=${encodeURIComponent(t.id)}&cat=${encodeURIComponent(cat)}">ROs</a>
        </div>
      </div>
    `;
  }
  function sectionStatsForTech(sec){
    const cats = sec.categories || [];
    const reqs = cats.map(cat=>Number(t.categories?.[cat]?.req)).filter(n=>Number.isFinite(n));
    const closes = cats.map(cat=>Number(t.categories?.[cat]?.close)).filter(n=>Number.isFinite(n));
    return {
      avgReq: reqs.length ? reqs.reduce((a,b)=>a+b,0)/reqs.length : null,
      avgClose: closes.length ? closes.reduce((a,b)=>a+b,0)/closes.length : null
    };
  }

  const sectionsHtml = (DATA.sections||[]).map(sec=>{
    const secStats = sectionStatsForTech(sec);
    const cats = (sec.categories||[]);
    // Benchmarks for section-level dials (avg across categories)
    const benchReqs = cats.map(cat=>{
      const b = (compareBasis==="store") ? getStoreBenchmarks(cat) : getTeamBenchmarks(cat, team);
      return Number(b && b.avgReq);
    }).filter(n=>Number.isFinite(n) && n>0);
    const benchCloses = cats.map(cat=>{
      const b = (compareBasis==="store") ? getStoreBenchmarks(cat) : getTeamBenchmarks(cat, team);
      return Number(b && b.avgClose);
    }).filter(n=>Number.isFinite(n) && n>0);

    const benchReq = benchReqs.length ? mean(benchReqs) : NaN;
    const benchClose = benchCloses.length ? mean(benchCloses) : NaN;

    // Goals for section-level dials (avg across categories)
    const goalReqs = cats.map(cat=>Number(getGoal(cat,"req"))).filter(n=>Number.isFinite(n) && n>0);
    const goalCloses = cats.map(cat=>Number(getGoal(cat,"close"))).filter(n=>Number.isFinite(n) && n>0);
    const goalReq = goalReqs.length ? mean(goalReqs) : NaN;
    const goalClose = goalCloses.length ? mean(goalCloses) : NaN;

    const asrVal = Number(secStats.avgReq);
    const soldVal = Number(secStats.avgClose);

    const pctAsr = (Number.isFinite(asrVal) && Number.isFinite(benchReq) && benchReq>0) ? (asrVal/benchReq) : NaN;
    const pctSold = (Number.isFinite(soldVal) && Number.isFinite(benchClose) && benchClose>0) ? (soldVal/benchClose) : NaN;

    const pctGoalAsr = (Number.isFinite(asrVal) && Number.isFinite(goalReq) && goalReq>0) ? (asrVal/goalReq) : NaN;
    const pctGoalSold = (Number.isFinite(soldVal) && Number.isFinite(goalClose) && goalClose>0) ? (soldVal/goalClose) : NaN;
    const pctGoal = [pctGoalAsr,pctGoalSold].filter(n=>Number.isFinite(n)).length
      ? mean([pctGoalAsr,pctGoalSold].filter(n=>Number.isFinite(n)))
      : NaN;

    const focusPct = (focus==="sold") ? pctSold : (focus==="goal" ? pctGoal : pctAsr);
    const focusLbl = (focus==="sold") ? "Sold" : (focus==="goal" ? "Goal" : "ASR");

    const dialASR = Number.isFinite(pctAsr) ? `<div class="svcGaugeWrap" style="--sz:44px">${svcGauge(pctAsr,"ASR")}</div>` : `<div class="svcGaugeWrap" style="--sz:44px"></div>`;
    const dialSold = Number.isFinite(pctSold) ? `<div class="svcGaugeWrap" style="--sz:44px">${svcGauge(pctSold,"Sold")}</div>` : `<div class="svcGaugeWrap" style="--sz:44px"></div>`;
    const dialGoal = Number.isFinite(pctGoal) ? `<div class="svcGaugeWrap" style="--sz:44px">${svcGauge(pctGoal,"Goal")}</div>` : `<div class="svcGaugeWrap" style="--sz:44px"></div>`;
    const dialFocus = Number.isFinite(focusPct) ? `<div class="svcGaugeWrap" style="--sz:112px">${svcGauge(focusPct,focusLbl)}</div>` : `<div class="svcGaugeWrap" style="--sz:112px"></div>`;

    const __cats = Array.from(new Set((sec.categories||[]).filter(Boolean)));
    const rows = __cats.map(cat=>renderCategoryRectSafe(cat, compareBasis)).join("");
return `
      <div class="panel">
        <div class="phead">
          <div class="titleRow">
            <div>
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <div class="h2 techH2">${safe(sec.name)}</div>
                <div class="secMiniDials">${dialASR}${dialSold}${dialGoal}</div>
              </div>
              <div class="sub">${appliedParts.join(" • ")}</div>
            </div>
            <div class="secHdrRight"><div class="secFocusDial">${dialFocus}</div><div class="secHdrStats" style="text-align:right">
                <div class="big">${fmtPct(secStats.avgReq)}</div>
                <div class="tag">ASR%</div>
                <div style="margin-top:6px;text-align:right;color:var(--muted);font-weight:900;font-size:13px">Sold%: <b style="color:var(--text)">${fmtPct(secStats.avgClose)}</b></div></div>
            </div>
          </div>
        </div>
        <div class="list">${rows ? `<div class="categoryGrid">${rows}</div>` : `<div class="notice">No categories found in this section.</div>`}</div>
      </div>
    `;
  }).join("");

  document.getElementById('app').innerHTML = `${header}${sectionsHtml}`;
  animateSvcGauges();
  initSectionToggles();

  const sel = document.getElementById('techFilter');
  if(sel){
    sel.addEventListener('change', ()=>{
      const v = sel.value || "total";
      const c = encodeURIComponent(compareBasis||"team");
      const fo = encodeURIComponent(focus||"asr");
      location.hash = `#/tech/${encodeURIComponent(t.id)}?filter=${encodeURIComponent(v)}&compare=${c}&focus=${fo}`;
    });
  }

  const compSel = document.getElementById('compareBasis');
  if(compSel){
    compSel.addEventListener('change', ()=>{
      const f = encodeURIComponent(filterKey);
      const c = encodeURIComponent(compSel.value||"team");
      const fo = encodeURIComponent(focus||"asr");
      location.hash = `#/tech/${encodeURIComponent(techId)}?filter=${f}&compare=${c}&focus=${fo}`;
    });
  }

  const focusSel = document.getElementById('techFocus');
  if(focusSel){
    focusSel.addEventListener('change', ()=>{
      const f = encodeURIComponent(filterKey);
      const c = encodeURIComponent(compareBasis||'team');
      const fo = encodeURIComponent(focusSel.value||'asr');
      location.hash = `#/tech/${encodeURIComponent(techId)}?filter=${f}&compare=${c}&focus=${fo}`;
    });
  }
}



// ===== Group pages (Maintenance / Fluids / Brakes & Tires) =====
const GROUPS = (() => {
  const obj = {};
  for (const sec of (DATA.sections || [])) {
    const key = String(sec.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key) continue;
    obj[key] = {
      label: String(sec.name || "").toUpperCase(),
      services: Array.isArray(sec.categories) ? sec.categories.slice() : []
    };
  }
  return obj;
})();

// Populate hamburger menu "ASR Categories" from DATA.sections (so it always includes every category).

function renderCategoryRectSafe(cat, compareBasis){
  try{
    return renderCategoryRectSafe(cat, compareBasis);
  }catch(e){
    console.error('renderCategoryRect error', cat, e);
    const eh = (s)=>String(s==null?'':s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const msg = eh(e && e.message ? e.message : String(e));
    const catName = eh(cat || 'Service');
    return `
      <div class="card serviceCard" style="border:1px solid rgba(255,255,255,.08)">
        <div class="svcHead" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div class="svcName">${catName}</div>
          <div class="pill" style="opacity:.65">Error</div>
        </div>
        <div style="padding:12px 12px 14px;color:#fca5a5;font-size:12px;line-height:1.3">
          Service tile failed to render: <span style="color:#fee2e2">${msg}</span>
        </div>
      </div>
    `;
  }
}


function populateAsrMenuLinks(){
  const host = document.getElementById("asrMenuLinks");
  if(!host) return;
  const secs = Array.isArray(DATA.sections) ? DATA.sections : [];
  const links = [];
  for(const sec of secs){
    const name = String(sec?.name || "").trim();
    if(!name) continue;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    links.push(`<a class="menuLink" href="#/group/${encodeURIComponent(key)}">${safe(name)}</a>`);
  }
  host.innerHTML = links.join("");
}

// Lazily computed caches (DATA-based; no dependency on tech page helpers)
let __ALL_TECHS = null;
function getAllTechsCached(){
  if(__ALL_TECHS) return __ALL_TECHS;
  const techs = (typeof DATA!=='undefined' && Array.isArray(DATA.techs)) ? DATA.techs : [];
  // Only Express + Kia are in this project
  __ALL_TECHS = techs.filter(t => (t.team==="EXPRESS" || t.team==="KIA"));
  return __ALL_TECHS;
}
let __ALL_CATS = null;
function getAllCategoriesSet(){
  if(__ALL_CATS) return __ALL_CATS;
  const set = new Set();
  for(const t of getAllTechsCached()){
    const cats = t.categories || {};
    for(const k of Object.keys(cats)) set.add(k);
  }
  __ALL_CATS = set;
  return set;
}

function getTechsByTeam(teamKey){

  const techs = getAllTechsCached();
  if(teamKey==="all") return techs.slice();
  return techs.filter(t => (t.team||"").toLowerCase() === teamKey);
}

function aggService(serviceName, teamKey){
  const techs = getTechsByTeam(teamKey);
  const totalRos = techs.reduce((s,t)=>s+(Number(t.ros)||0),0);
  let asr=0, sold=0;
  const rows=[];
  for(const t of techs){
    const c = (t.categories||{})[serviceName];
    if(!c) continue;
    const a = Number(c.asr)||0;
    const so = Number(c.sold)||0;
    asr += a; sold += so;
    const req = totalRos ? (a/totalRos) : 0;   // share of total ROs
    const close = a ? (so/a) : 0;
    rows.push({id:t.id, name:t.name, req, close});
  }
  const reqTot = totalRos ? (asr/totalRos) : 0;
  const closeTot = asr ? (sold/asr) : 0;
  return {serviceName, totalRos, asr, sold, reqTot, closeTot, techRows: rows};
}

function renderGroupPage(groupKey){
  const g = GROUPS[groupKey];
  if(!g){
    document.getElementById("app").innerHTML = `<div class="panel"><div class="h2">Unknown page</div><div class="sub"><a href="#/">Back</a></div></div>`;
    return;
  }

  // read querystring from hash
  const hash = location.hash || "";
  const qs = hash.includes("?") ? hash.split("?")[1] : "";
  let teamKey = "all";
  let focus = "asr"; // asr | sold
  if(qs){
    for(const part of qs.split("&")){
      const [k,v]=part.split("=");
      if(k==="team") teamKey = decodeURIComponent(v||"all") || "all";
      if(k==="focus") focus = decodeURIComponent(v||"asr") || "asr";
    }
  }

  const techs = getTechsByTeam(teamKey);
  const totalRos = techs.reduce((s,t)=>s+(Number(t.ros)||0),0);
  const avgOdo = totalRos ? techs.reduce((s,t)=>s+(Number(t.odo)||0)*(Number(t.ros)||0),0)/totalRos : 0;

  // Only include services that actually exist in DATA
  const allCats = getAllCategoriesSet();
  const services = g.services.filter(s => allCats.has(s));

  // Aggregate per service across the selected team
  const serviceAggs = services.map(serviceName=>{
    let asr=0, sold=0;
    // for per-tech list
    const techRows = [];
    for(const t of techs){
      const c = (t.categories||{})[serviceName];
      const a = Number(c?.asr)||0;
      const so = Number(c?.sold)||0;
      asr += a; sold += so;
      // per-tech metrics for this service (ratio form, not *100)
      const rosTech = Number(t.ros)||0;
      const req = rosTech ? (a/rosTech) : 0;
      const close = a ? (so/a) : 0;
      techRows.push({id:t.id, name:t.name, ros:rosTech, asr:a, sold:so, req, close});
    }
    const reqTot = totalRos ? (asr/totalRos) : 0;     // ASR/RO (ratio) for team/store/all in this group
    const closeTot = asr ? (sold/asr) : 0;            // Sold%
    return {serviceName, totalRos, asr, sold, reqTot, closeTot, techRows};
  });

  // Summary stats for the group page (average across services)
  const avgReq = serviceAggs.length ? serviceAggs.reduce((s,x)=>s+x.reqTot,0)/serviceAggs.length : 0;
  const avgClose = serviceAggs.length ? serviceAggs.reduce((s,x)=>s+x.closeTot,0)/serviceAggs.length : 0;

  // Rank services by ASR/RO (reqTot)
  const ranked = serviceAggs.slice().sort((a,b)=> (b.reqTot - a.reqTot));
  const rankMap = new Map();
  ranked.forEach((x,i)=>rankMap.set(x.serviceName, {rank:i+1,total:ranked.length}));

  // ---- Top header (same structure as tech detail header) ----
  const title = g.label;
  const gfOpen = !!UI.groupFilters[groupKey];
  const filters = `
    <div class="iconBar">
      <button class="iconBtn" onclick="toggleGroupFilters('${safe(groupKey)}')" aria-label="Filters" title="Filters">${ICON_FILTER}</button>
      <button class="iconBtn" onclick="openTechSearch()" aria-label="Search" title="Search">${ICON_SEARCH}</button>
    </div>
    <div class="ctlPanel ${gfOpen?"open":""}">
      <div class="filtersRow">
        <div class="filter">
          <div class="smallLabel">Team</div>
          <select class="sel" id="grpTeam">
            <option value="all" ${teamKey==="all"?"selected":""}>All</option>
            <option value="express" ${teamKey==="express"?"selected":""}>Express</option>
            <option value="kia" ${teamKey==="kia"?"selected":""}>Kia</option>
          </select>
        </div>
        <div class="filter">
          <div class="smallLabel">Focus</div>
          <select class="sel" id="grpFocus">
            <option value="asr" ${focus==="asr"?"selected":""}>ASR/RO</option>
            <option value="sold" ${focus==="sold"?"selected":""}>Sold%</option>
          </select>
        </div>
      </div>
    </div>
  `;

  const header = `
    <div class="panel">
      <div class="phead">
        <div class="titleRow">
          <div>
            <div class="h2">${safe(title)}</div>
            <div class="sub"><a href="#/" style="text-decoration:none">← Back to dashboard</a></div>
          </div>
          <div>
            <div class="big">${fmt1(avgReq,1)}</div>
            <div class="tag">Avg ASR/RO (Summary)</div>
          </div>
        </div>
        <div class="pills">
          <div class="pill"><div class="k">ROs</div><div class="v">${fmtInt(totalRos)}</div></div>
          <div class="pill"><div class="k">Avg ODO</div><div class="v">${fmtInt(avgOdo)}</div></div>
          <div class="pill"><div class="k">Sold %</div><div class="v">${fmtPct(avgClose)}</div></div>
        </div>
        ${filters}
      </div>
    </div>
  `;

  // ---- Service cards (look like tech detail category cards, but with technician list instead of benchmarks) ----
  function techListFor(service){
  const rows = service.techRows.slice().sort((a,b)=>{
    return focus==="sold" ? (b.close - a.close) : (b.req - a.req);
  });

  return rows.map((r, idx)=>{
    const rank = idx + 1;

    if(focus==="sold"){
      return `<div class="techRow">
        <div class="techRowLeft">
          <span class="rankNum">${rank}.</span>
          <a href="#/tech/${encodeURIComponent(r.id)}">${safe(r.name)}</a>
        </div>
        <span class="mini">
          ROs ${fmtInt(r.ros)} • ASR ${fmtInt(r.asr)} • Sold ${fmtInt(r.sold)} • <b>${fmtPct(r.close)}</b>
        </span>
      </div>`;
    }

    return `<div class="techRow">
      <div class="techRowLeft">
        <span class="rankNum">${rank}.</span>
        <a href="#/tech/${encodeURIComponent(r.id)}">${safe(r.name)}</a>
      </div>
      <span class="mini">
        ROs ${fmtInt(r.ros)} • ASR ${fmtInt(r.asr)} • <b>${fmtPctPlain(r.req)}</b>
      </span>
    </div>`;
  }).join("");
}

  const cards = serviceAggs.map(s=>{
    const rk = rankMap.get(s.serviceName) || {rank:"—",total:"—"};
    const roLink = `#/ros/${encodeURIComponent(s.serviceName)}?team=${encodeURIComponent(teamKey)}`;
    return `
      <div class="catCard serviceCard">
        <div class="catHeader">
          <div>
            <div class="catTitle">${safe(s.serviceName)}</div>
            <div class="catCounts">ROs: <b>${fmtInt(totalRos)}</b> • ASR: <b>${fmtInt(s.asr)}</b> • Sold: <b>${fmtInt(s.sold)}</b></div>
          </div>
          <div class="catRank">${rk.rank} of ${rk.total}<div class="byAsr">ASR/RO%</div></div>
        </div>

        <div class="techTilesRow">
          <div class="statTile t3">
            <div class="tLbl">ASR/RO</div>
            <div class="tVal">${fmtPctPlain(s.reqTot)}</div>
            <div class="goalLine">Goal: ${fmtGoal(getGoal(s.serviceName,"req"))}</div>
          </div>
          <div class="statTile t4">
            <div class="tLbl">Sold%</div>
            <div class="tVal">${fmtPct(s.closeTot)}</div>
            <div class="goalLine">Goal: ${fmtGoal(getGoal(s.serviceName,"close"))}</div>
          </div>
        </div>

        <div class="techList">${techListFor(s) || '<div class="sub">No technicians found.</div>'}</div>

        <div class="roLink"><a href="${roLink}">ROs</a></div>
      </div>
    `;
  }).join("");

  document.getElementById("app").innerHTML = header + `
    <div class="sectionFrame">
      <div class="categoryGrid">${cards}</div>
    </div>
  `;

  // attach listeners
  const teamSel = document.getElementById("grpTeam");
  const focusSel = document.getElementById("grpFocus");
  const updateHash = ()=>{
    const t = teamSel.value;
    const f = focusSel.value;
    location.hash = `#/group/${groupKey}?team=${encodeURIComponent(t)}&focus=${encodeURIComponent(f)}`;
  };
  teamSel.addEventListener("change", updateHash);
  focusSel.addEventListener("change", updateHash);
}




function renderGoalsPage(){
  const app = document.getElementById("app");

  // Build section -> categories mapping from DATA.sections
  const sections = Array.isArray(DATA.sections) ? DATA.sections : [];
  const allSet = (typeof getAllCategoriesSet==="function") ? getAllCategoriesSet() : new Set();
  const allCats = Array.from(allSet).map(s=>String(s)).filter(Boolean);

  function catsForSectionName(name){
    const up = String(name||"").toUpperCase();
    const sec = sections.find(s=>String(s.name||"").toUpperCase().includes(up));
    const list = sec && Array.isArray(sec.categories) ? sec.categories.map(String).filter(Boolean) : [];
    // Keep only cats that actually exist in the dataset
    const exist = new Set(allCats);
    return list.filter(c=>exist.has(c));
  }

  // Desired display orders (append any remaining items afterwards)
  const MAINT_ORDER = ["ROTATE","ROTATE AND BALANCE","ALIGNMENT","BATTERY","SPARK PLUGS","CABIN AIR FILTER","ENGINE AIR FILTER"];
  const FLUIDS_ORDER = ["MOA","CF5","CFS","BRAKE FLUID","ENGINE COOLANT","TRANS FLUID"];
  const BRAKES_ORDER = ["TOTAL BRAKES AND ROTORS","FRONT BRAKES AND ROTORS","REAR BRAKES AND ROTORS"];
  const TIRES_ORDER = ["TOTAL SETS OF 2 TIRES","TWO TIRES","FOUR TIRES"];

  function orderCats(cats, orderArr){
    const upMap = new Map();
    (cats||[]).forEach(c=>upMap.set(String(c).toUpperCase(), c));
    const used = new Set();
    const out = [];
    (orderArr||[]).forEach(o=>{
      const key = String(o).toUpperCase();
      if(upMap.has(key)){
        out.push(upMap.get(key));
        used.add(upMap.get(key));
      }else{
        // try partial match (e.g., "TOTAL BRAKES AND ROTORS" vs "TOTAL BRAKES & ROTORS")
        const found = (cats||[]).find(c=>String(c).toUpperCase().replace(/&/g,"AND").includes(key.replace(/&/g,"AND")));
        if(found && !used.has(found)){ out.push(found); used.add(found); }
      }
    });
    const rest = (cats||[]).filter(c=>!used.has(c)).slice().sort((a,b)=>String(a).localeCompare(String(b)));
    return out.concat(rest);
  }

  const MAINT = orderCats(catsForSectionName("MAINTENANCE"), MAINT_ORDER);
  const FLUIDS = orderCats(catsForSectionName("FLUIDS"), FLUIDS_ORDER);
  const BRAKES = orderCats(catsForSectionName("BRAKES"), BRAKES_ORDER);
  const TIRES = orderCats(catsForSectionName("TIRES"), TIRES_ORDER);

  // Track mapped brakes categories (for saving goals back to dataset names)
  let BRAKES_FOUND = { total:null, front:null, rear:null };
  let TIRES_FOUND  = { total:null, two:null, four:null };

  const used = new Set([...MAINT, ...FLUIDS, ...BRAKES, ...TIRES]);
  const leftovers = allCats.filter(c=>!used.has(c)).sort((a,b)=>a.localeCompare(b));

  // Precompute store-wide averages for each category
  const AVG = {};
  for(const cat of allCats){
    let nReq=0, sReq=0, nClose=0, sClose=0;
    for(const t of (DATA.techs||[])){
      const c=t.categories?.[cat];
      const req=Number(c?.req);
      const close=Number(c?.close);
      if(Number.isFinite(req)){ sReq += req; nReq++; }
      if(Number.isFinite(close)){ sClose += close; nClose++; }
    }
    AVG[cat] = {
      avgReq: nReq? (sReq/nReq) : null,
      avgClose: nClose? (sClose/nClose) : null
    };
  }

  function avgLineHtml(cat){
    const a = AVG[cat] || {};
    const aReq = fmtPct(a.avgReq);
    const aClose = fmtPct(a.avgClose);
    return `
      <div class="gAvg">Avg ASR/RO%: ${safe(aReq)}</div>
      <div class="gAvg gAvgSold">Avg Sold%: ${safe(aClose)}</div>
    `;
  }

  function rowHtml(cat, displayName){
    const catEnc = encodeURIComponent(cat);
    const vReq = goalToInput(getGoalRaw(cat,"req"));
    const vClose = goalToInput(getGoalRaw(cat,"close"));
    return `
      <div class="goalRow tight" id="row_${catEnc}" data-goal-cat="${safe(cat)}">
        <div class="goalName">
          <div class="gTitle">${safe(displayName || cat)}</div>
          ${avgLineHtml(cat)}
        </div>
        <input class="goalMini" id="g_${catEnc}_req" inputmode="decimal" value="${safe(vReq)}" />
        <input class="goalMini" id="g_${catEnc}_close" inputmode="decimal" value="${safe(vClose)}" />
      </div>
    `;
  }

  function specialRowHtml(label, key){
    const kEnc = encodeURIComponent(key);
    const vReq = goalToInput(getGoalRaw(key,"req"));
    const vClose = goalToInput(getGoalRaw(key,"close"));
    return `
      <div class="goalRow tight">
        <div class="goalName">
          <div class="gTitle">${safe(label)}</div>
        </div>
        <input class="goalMini" id="g_${kEnc}_req" inputmode="decimal" value="${safe(vReq)}" />
        <input class="goalMini" id="g_${kEnc}_close" inputmode="decimal" value="${safe(vClose)}" />
      </div>
    `;
  }

  function quadHtml(title, cats, includeLeftovers=false, isBrakes=false, isTires=false){
    const list = (cats||[]).slice();
    let rows = list.map(c=>rowHtml(c)).join("");
    if(includeLeftovers && leftovers.length){
      rows += `
        <div class="goalDivider">Other</div>
        ${leftovers.map(c=>rowHtml(c)).join("")}
      `;
    }


    // Fluids quadrant: optional "ONE GOAL FOR ALL RECS?" toggle with synthetic ALL FLUIDS row
    if(String(title||"").toLowerCase()==="fluids"){
      const applyAllFl = String(getGoalRaw("__META_FLUIDS","apply_all"))==="1";
      const applyRow = `
        <div class="brApplyAllRow">
          <div class="q">ONE GOAL FOR ALL RECS?</div>
          <label><input type="radio" name="fl_apply_all" value="yes" ${applyAllFl?'checked':''}> Yes</label>
          <label><input type="radio" name="fl_apply_all" value="no"  ${!applyAllFl?'checked':''}> No</label>
        </div>
      `;
      // Add synthetic row (hidden unless apply-all is enabled)
      const allRow = rowHtml("__FLUIDS_ALL","ALL FLUIDS").replace('class="goalRow tight', 'class="goalRow tight fluidsAllRow');
      const body = `
        <div class="goalQuadTitle">${safe(title)}</div>
        ${applyRow}
        <div class="goalQuadHeadRow">
          <div class="ghName"></div>
          <div class="ghMetric">ASR/RO%</div>
          <div class="ghMetric">Sold%</div>
        </div>
        <div class="goalQuadBody ${applyAllFl?'applyAllOn':''}">
          <div class="${applyAllFl?'':'hidden'}">${allRow}</div>
          ${rows}
        </div>
      `;
      return `<div class="goalQuad">${body}</div>`;
    }

    // Brakes quadrant: TOTAL + FRONT + REAR with Apply-to-all and Red/Yellow toggle
    if(isBrakes){
  const norm = (x)=>String(x||"").toUpperCase().replace(/&/g,"AND");
  const totalCat = (list||[]).find(c=>{
    const u = norm(c);
    return u.includes("TOTAL") && u.includes("BRAK") && u.includes("ROTOR");
  }) || (list||[]).find(c=>{
    const u = norm(c);
    return u.includes("TOTAL") && u.includes("BRAK");
  }) || null;

  const frontCat = (list||[]).find(c=>{
    const u = norm(c);
    return u.includes("FRONT") && u.includes("BRAK") && u.includes("ROTOR");
  }) || (list||[]).find(c=>{
    const u = norm(c);
    return u.includes("FRONT") && u.includes("BRAK");
  }) || null;

  const rearCat = (list||[]).find(c=>{
    const u = norm(c);
    return u.includes("REAR") && u.includes("BRAK") && u.includes("ROTOR");
  }) || (list||[]).find(c=>{
    const u = norm(c);
    return u.includes("REAR") && u.includes("BRAK");
  }) || null;

  BRAKES_FOUND.total = totalCat;
  BRAKES_FOUND.front = frontCat;
  BRAKES_FOUND.rear  = rearCat;

  const applyAll = String(getGoalRaw("__META_BRAKES","apply_all"))==="1";
  const ryGlobal = String(getGoalRaw("__META_BRAKES","ry"))==="1";
  const applyRow = `
    <div class="brApplyAllRow">
      <div class="q">ONE GOAL FOR ALL RECS?</div>
      <label><input type="radio" name="br_apply_all" value="yes" ${applyAll?'checked':''}> Yes</label>
      <label><input type="radio" name="br_apply_all" value="no"  ${!applyAll?'checked':''}> No</label>
    </div>
    <div class="brApplyAllRow brGlobalRow" style="margin-top:6px">
      <div class="q">SET GOALS FOR RED/YELLOW?</div>
      <div class="brRYRight">
        <span class="swLab off">Off</span>
        <label class="switch sm">
          <input id="br_ry_global" type="checkbox" ${ryGlobal?'checked':''}>
          <span class="slider"></span>
        </label>
        <span class="swLab on">On</span>
      </div>
    </div>
  `;

function brakeRowHtml(key,label,mappedCat){
    const keyEnc = encodeURIComponent(key);
    const avgHtml = mappedCat ? avgLineHtml(mappedCat) : "";

    const rReq   = goalToInput(getGoalRaw(key,"req"));
    const rClose = goalToInput(getGoalRaw(key,"close"));
    const yReq   = goalToInput(getGoalRaw(key,"req_y"));
    const yClose = goalToInput(getGoalRaw(key,"close_y"));

    const rowDisabled = (applyAll && key!=="BRAKES_TOTAL");
    const ryOn = ryGlobal;

    return `
      <div class="goalRow tight brakeRow ${rowDisabled?'rowDisabled':''}" data-brake-key="${safe(key)}">
        <div class="goalName">
          <div class="gTitle">${safe(label)}</div>
          ${avgHtml}
        </div>

        <div class="brCell">
          <div class="brLine">
            <span class="brTag red">RED</span>
            <input id="b_${keyEnc}_req_red" class="goalMini" inputmode="numeric" value="${safe(rReq)}">
          </div>
          <div class="brLine brY ${ryOn?'':'disabled'}">
            <span class="brTag yellow">YELLOW</span>
            <input id="b_${keyEnc}_req_yellow" class="goalMini" ${ryOn?'':'disabled'} inputmode="numeric" value="${safe(yReq)}">
          </div>
        </div>

        <div class="brCell">
          <div class="brLine">
                        <input id="b_${keyEnc}_close_red" class="goalMini" inputmode="numeric" value="${safe(rClose)}">
          </div>
          <div class="brLine brY ${ryOn?'':'disabled'}">
                        <input id="b_${keyEnc}_close_yellow" class="goalMini" ${ryOn?'':'disabled'} inputmode="numeric" value="${safe(yClose)}">
          </div>
        </div>
      </div>
    `;
  }

  const totalRow = brakeRowHtml("BRAKES_TOTAL", "TOTAL BRAKES & ROTORS", totalCat);
  const frontRow = brakeRowHtml("BRAKES_FRONT", "FRONT BRAKES & ROTORS", frontCat);
  const rearRow  = brakeRowHtml("BRAKES_REAR",  "REAR BRAKES & ROTORS",  rearCat);

  return `
    <div class="goalQuad brakes ${ryGlobal?'ry-on':'ry-off'}">
      <div class="goalQuadTitle">${safe(title)}</div>
      ${applyRow}
      <div class="goalQuadHeadRow">
        <div class="ghName"></div>
        <div class="ghMetric">ASR/RO%</div>
        <div class="ghMetric">SOLD%</div>
      </div>
      <div class="goalQuadBody">
        ${totalRow}
        ${frontRow}
        ${rearRow}
      </div>
    </div>
  `;
}

    // Tires quadrant: TOTAL SETS OF 2 TIRES (global) + TWO TIRES + FOUR TIRES
    if(isTires){
      const norm = (x)=>String(x||"").toUpperCase().replace(/&/g,"AND");
      const totalCat = (list||[]).find(c=>{
        const u = norm(c);
        return u.includes("TOTAL") && u.includes("SET") && u.includes("2") && u.includes("TIRE");
      }) || null;

      const twoCat = (list||[]).find(c=>{
        const u = norm(c);
        return (u.startsWith("TWO TIRE") || (u.includes("TWO") && u.includes("TIRE"))) && !u.includes("FOUR") && !u.includes("TOTAL");
      }) || null;

      const fourCat = (list||[]).find(c=>{
        const u = norm(c);
        return u.includes("FOUR") && u.includes("TIRE") && !u.includes("TOTAL");
      }) || null;

      // Track mapped tires categories (for saving back to dataset names)
      TIRES_FOUND.total = totalCat;
      TIRES_FOUND.two   = twoCat;
      TIRES_FOUND.four  = fourCat;

      const applyAll = String(getGoalRaw("__META_TIRES","apply_all"))==="1";
      const ryGlobal = String(getGoalRaw("__META_TIRES","ry"))==="1";

      const applyRow = `
        <div class="brApplyAllRow">
          <div class="q">ONE GOAL FOR ALL RECS?</div>
          <label><input type="radio" name="tr_apply_all" value="yes" ${applyAll?'checked':''}> Yes</label>
          <label><input type="radio" name="tr_apply_all" value="no"  ${!applyAll?'checked':''}> No</label>
        </div>
        <div class="brApplyAllRow brGlobalRow" style="margin-top:6px">
          <div class="q">SET GOALS FOR RED/YELLOW?</div>
          <div class="brRYRight">
            <span class="swLab off">Off</span>
            <label class="switch sm">
              <input id="tr_ry_global" type="checkbox" ${ryGlobal?'checked':''}>
              <span class="slider"></span>
            </label>
            <span class="swLab on">On</span>
          </div>
        </div>
      `;

      function tireRowHtml(key,label,mappedCat){
        const keyEnc = encodeURIComponent(key);
        const avgHtml = mappedCat ? avgLineHtml(mappedCat) : "";

        const rReq   = goalToInput(getGoalRaw(key,"req"));
        const rClose = goalToInput(getGoalRaw(key,"close"));
        const yReq   = goalToInput(getGoalRaw(key,"req_y"));
        const yClose = goalToInput(getGoalRaw(key,"close_y"));

        const rowDisabled = (applyAll && key!=="TIRES_TOTAL2");
        const ryOn = ryGlobal;

        return `
          <div class="goalRow tight tireRow ${rowDisabled?'rowDisabled':''}" data-tire-key="${safe(key)}">
            <div class="goalName">
              <div class="gTitle">${safe(label)}</div>
              ${avgHtml}
            </div>

            <div class="brCell">
              <div class="brLine">
                <span class="brTag red">RED</span>
                <input id="t_${keyEnc}_req_red" class="goalMini" inputmode="numeric" value="${safe(rReq)}">
              </div>
              <div class="brLine brY ${ryOn?'':'disabled'}">
                <span class="brTag yellow">YELLOW</span>
                <input id="t_${keyEnc}_req_yellow" class="goalMini" ${rowDisabled?'disabled':''} ${ryOn?'':'disabled'} inputmode="numeric" value="${safe(yReq)}">
              </div>
            </div>

            <div class="brCell">
              <div class="brLine">
                <input id="t_${keyEnc}_close_red" class="goalMini" inputmode="numeric" value="${safe(rClose)}">
              </div>
              <div class="brLine brY ${ryOn?'':'disabled'}">
                <input id="t_${keyEnc}_close_yellow" class="goalMini" ${rowDisabled?'disabled':''} ${ryOn?'':'disabled'} inputmode="numeric" value="${safe(yClose)}">
              </div>
            </div>
          </div>
        `;
      }

      const totalRow = tireRowHtml("TIRES_TOTAL2","TOTAL SETS OF 2 TIRES", totalCat);
      const twoRow   = tireRowHtml("TIRES_TWO","TWO TIRES", twoCat);
      const fourRow  = tireRowHtml("TIRES_FOUR","FOUR TIRES", fourCat);

      return `
        <div class="goalQuad tires ${ryGlobal?'ry-on':'ry-off'}">
          <div class="goalQuadTitle">${safe(title)}</div>
          ${applyRow}
          <div class="goalQuadHeadRow">
            <div class="ghName"></div>
            <div class="ghMetric">ASR/RO%</div>
            <div class="ghMetric">SOLD%</div>
          </div>
          <div class="goalQuadBody">
            ${totalRow}
            ${twoRow}
            ${fourRow}
          </div>
        </div>
      `;
    }
    let applyRow = "";

    return `
      <div class="goalQuad">
        <div class="goalQuadTitle">${safe(title)}</div>
        ${applyRow}
        <div class="goalQuadHeadRow">
          <div class="ghName"></div>
          <div class="ghMetric">ASR/RO%</div>
          <div class="ghMetric">Sold%</div>
        </div>
        <div class="goalQuadBody">${rows}</div>
      </div>
    `;
  }

  // One big box; inside we render a 2x2 grid of quadrants
  app.innerHTML = `
    <div class="panel goalsBig halfPage">
      <div class="goalsBigTop">
        <div>
          <div class="goalsH1">GOALS</div>
          <div class="sub" style="margin-top:4px">Set goals for each service. Values populate the “Goal:” lines throughout the dashboard.</div>
        </div>
        <button class="btn" id="saveGoalsAll" type="button">Save</button>
      </div>

      <div class="goalsQuads">
        ${quadHtml("Maintenance", MAINT, true, false)}
        ${quadHtml("Fluids", FLUIDS, false, false)}
        ${quadHtml("Brakes", BRAKES, false, true)}
        ${quadHtml("Tires", TIRES, false, false, true)}
      </div>
    </div>
  `;


  // Wire up Fluids controls (Apply-to-all)
  function _setGoalRowDisabled(cat, disabled){
    const id = "row_"+encodeURIComponent(cat);
    const row = document.getElementById(id);
    if(!row) return;
    row.classList.toggle("rowDisabled", !!disabled);
    row.querySelectorAll("input").forEach(inp=>{ inp.disabled = !!disabled; });
  }
  function _applyFluidsApplyAll(){
    const yes = document.querySelector('input[name="fl_apply_all"][value="yes"]');
    const on = !!(yes && yes.checked);
    setGoalRaw("__META_FLUIDS","apply_all", on ? 1 : 0);
    // show/hide synthetic row
    const wrap = document.querySelector('.fluidsAllRow')?.parentElement;
    if(wrap) wrap.classList.toggle("hidden", !on);

    // disable all fluid service rows when apply-all is on
    for(const c of (FLUIDS||[])){
      _setGoalRowDisabled(c, on);
    }
    // keep ALL row enabled
    _setGoalRowDisabled("__FLUIDS_ALL", false);
  }
  document.querySelectorAll('input[name="fl_apply_all"]').forEach(r=>{
    r.addEventListener("change", _applyFluidsApplyAll);
  });
  _applyFluidsApplyAll();

  // Wire up Brakes controls (Apply-to-all + Red/Yellow toggles)
  function _setRowDisabled(brakeKey, disabled){
    const row = document.querySelector(`.brakeRow[data-brake-key="${brakeKey}"]`);
    if(!row) return;
    row.classList.toggle("rowDisabled", !!disabled);
    row.querySelectorAll("input").forEach(inp=>{
      // Keep apply-all radios always enabled (they live in TOTAL row)
      if(inp.name==="br_apply_all") return;
      inp.disabled = !!disabled;
    });
  }

  function _applyYellowGlobal(){
    const ry = document.getElementById("br_ry_global");
    const on = !!(ry && ry.checked);

    const quad = document.querySelector(".goalQuad.brakes");
    if(quad){
      quad.classList.toggle("ry-on", on);
      quad.classList.toggle("ry-off", !on);
    }
["BRAKES_TOTAL","BRAKES_FRONT","BRAKES_REAR"].forEach(brakeKey=>{
      const row = document.querySelector(`.brakeRow[data-brake-key="${brakeKey}"]`);
      if(!row) return;

      const disabledRow = row.classList.contains("rowDisabled");

      row.querySelectorAll(".brLine.brY").forEach(line=>{
        line.classList.toggle("disabled", !on);
      });

      const keyEnc = encodeURIComponent(brakeKey);
      const yReq   = document.getElementById(`b_${keyEnc}_req_yellow`);
      const yClose = document.getElementById(`b_${keyEnc}_close_yellow`);
      [yReq,yClose].forEach(el=>{
        if(!el) return;
        el.disabled = (!on) || disabledRow;
      });
    });
  }

  

  // Universal apply-all (generic categories): first service becomes universal, others disabled + mirror values
  function _setGenericRowDisabled(cat, disabled){
    const catEnc = encodeURIComponent(cat);
    const row = document.getElementById(`row_${catEnc}`);
    if(row) row.classList.toggle("rowDisabled", !!disabled);
    const elReq = document.getElementById(`g_${catEnc}_req`);
    const elClose = document.getElementById(`g_${catEnc}_close`);
    if(elReq) elReq.disabled = !!disabled;
    if(elClose) elClose.disabled = !!disabled;
  }

  function _copyGenericFrom(universalCat, targetCat){
    const uEnc = encodeURIComponent(universalCat);
    const tEnc = encodeURIComponent(targetCat);
    const uReq = document.getElementById(`g_${uEnc}_req`);
    const uClose = document.getElementById(`g_${uEnc}_close`);
    const tReq = document.getElementById(`g_${tEnc}_req`);
    const tClose = document.getElementById(`g_${tEnc}_close`);
    if(tReq && uReq) tReq.value = uReq.value;
    if(tClose && uClose) tClose.value = uClose.value;
  }

  function _wireUniversalCategory(metaKey, cats){
    const yes = document.querySelector(`input[name="${metaKey}_apply_all"][value="yes"]`);
    const no  = document.querySelector(`input[name="${metaKey}_apply_all"][value="no"]`);
    if(!yes && !no) return;

    const universal = (cats && cats.length) ? cats[0] : null;

    const applyNow = ()=>{
      const on = !!(yes && yes.checked);
      (cats||[]).forEach((c, i)=>{
        if(!c) return;
        const disabled = on && i>0;
        _setGenericRowDisabled(c, disabled);
        if(disabled && universal){
          _copyGenericFrom(universal, c);
        }
      });
    };

    [yes,no].forEach(el=>{
      if(!el) return;
      el.addEventListener("change", ()=>{
        const on = !!(yes && yes.checked);
        setGoalRaw(metaKey, "apply_all", on ? "1" : "0");
        applyNow();
        equalizeGoalQuadrants();
      });
    });

    if(universal){
      const uEnc = encodeURIComponent(universal);
      ["req","close"].forEach(field=>{
        const el = document.getElementById(`g_${uEnc}_${field}`);
        if(!el) return;
        el.addEventListener("input", ()=>{
          const on = !!(yes && yes.checked);
          if(on){
            (cats||[]).slice(1).forEach(c=>_copyGenericFrom(universal, c));
          }
        });
      });
    }

    applyNow();
  }

function _wireBrakes(){
    const yes = document.querySelector('input[name="br_apply_all"][value="yes"]');
    const no  = document.querySelector('input[name="br_apply_all"][value="no"]');
    const applyNow = ()=>{
      const applyAll = !!(yes && yes.checked);
      _setRowDisabled("BRAKES_FRONT", applyAll);
      _setRowDisabled("BRAKES_REAR",  applyAll);
      _applyYellowGlobal();
    };
    if(yes) yes.addEventListener("change", applyNow);
    if(no)  no.addEventListener("change", applyNow);

    // If universal is enabled, keep TWO/Four in sync as you edit the TOTAL row
    ["req_red","close_red","req_yellow","close_yellow"].forEach(sfx=>{
      const id = `t_${encodeURIComponent("TIRES_TOTAL2")}_${sfx}`;
      const el = document.getElementById(id);
      if(el){
        el.addEventListener("input", ()=>{
          const applyAll = !!(document.querySelector('input[name="tr_apply_all"][value="yes"]')?.checked);
          if(applyAll){
            _copyTireFromTotal("TIRES_TWO");
            _copyTireFromTotal("TIRES_FOUR");
          }
        });
      }
    });

    
    const ry = document.getElementById("br_ry_global");
    if(ry) ry.addEventListener("change", ()=>{ _applyYellowGlobal(); equalizeGoalQuadrants(); });

    applyNow();
    equalizeGoalQuadrants();
  }


  function _setTireRowDisabled(key, disabled){
    const row = document.querySelector(`.tireRow[data-tire-key="${key}"]`);
    if(!row) return;
    row.classList.toggle("rowDisabled", !!disabled);
    row.querySelectorAll("input.goalMini").forEach(inp=>{
      const isYellow = inp.id.includes("_yellow");
      const ry = document.getElementById("tr_ry_global");
      const ryOn = !!(ry && ry.checked);
      if(isYellow && !ryOn){
        inp.disabled = true;
      }else{
        inp.disabled = !!disabled;
      }
    });
  }

  function _applyTiresRY(on){
    const quad = document.querySelector(".goalQuad.tires");
    if(!quad) return;
    quad.classList.toggle("ry-on", !!on);
    quad.classList.toggle("ry-off", !on);
    quad.querySelectorAll('input[id*="_yellow"]').forEach(inp=>{
      const row = inp.closest(".rowDisabled");
      inp.disabled = (!on) || !!row;
    });
  }

  

  // Tires: when "one goal for all recs" is enabled, use TOTAL SETS OF 2 TIRES as universal
  function _tireIds(key){
    const k = encodeURIComponent(key);
    return {
      rReq:   `t_${k}_req_red`,
      rClose: `t_${k}_close_red`,
      yReq:   `t_${k}_req_yellow`,
      yClose: `t_${k}_close_yellow`,
    };
  }

  function _snapshotTireRow(key){
    const row = document.querySelector(`.tireRow[data-tire-key="${key}"]`);
    if(!row) return;
    // snapshot only once per apply-all cycle
    if(row.dataset.snap === "1") return;
    const ids = _tireIds(key);
    Object.values(ids).forEach(id=>{
      const el = document.getElementById(id);
      if(el) row.dataset["prev_"+id] = el.value;
    });
    row.dataset.snap = "1";
  }

  function _restoreTireRow(key){
    const row = document.querySelector(`.tireRow[data-tire-key="${key}"]`);
    if(!row) return;
    const ids = _tireIds(key);
    Object.values(ids).forEach(id=>{
      const el = document.getElementById(id);
      const prev = row.dataset["prev_"+id];
      if(el && typeof prev === "string") el.value = prev;
      delete row.dataset["prev_"+id];
    });
    delete row.dataset.snap;
  }

  function _copyTireFromTotal(key){
    const srcIds = _tireIds("TIRES_TOTAL2");
    const dstIds = _tireIds(key);
    const map = [
      ["rReq","rReq"],["rClose","rClose"],
      ["yReq","yReq"],["yClose","yClose"],
    ];
    map.forEach(([s,d])=>{
      const src = document.getElementById(srcIds[s]);
      const dst = document.getElementById(dstIds[d]);
      if(src && dst) dst.value = src.value;
    });
  }
function _wireTires(){
    const applyNow = ()=>{
      const applyAll = !!(document.querySelector('input[name="tr_apply_all"][value="yes"]')?.checked);
      // Persist meta so refresh keeps state
      setGoalRaw("__META_TIRES","apply_all", applyAll ? "1" : "0");

      // Universal behavior: TOTAL SETS OF 2 TIRES drives all tire goals when enabled
      if(applyAll){
        ["TIRES_TWO","TIRES_FOUR"].forEach(k=>{
          _snapshotTireRow(k);
          _copyTireFromTotal(k);
        });
      }else{
        ["TIRES_TWO","TIRES_FOUR"].forEach(k=>_restoreTireRow(k));
      }

      _setTireRowDisabled("TIRES_TWO", applyAll);
      _setTireRowDisabled("TIRES_FOUR", applyAll);

      const on = !!(document.getElementById("tr_ry_global")?.checked);
      _applyTiresRY(on);
      equalizeGoalQuadrants();
    };

    const ryNow = ()=>{
      const on = !!(document.getElementById("tr_ry_global")?.checked);
      setGoalRaw("__META_TIRES","ry", on ? "1" : "0");
      _applyTiresRY(on);
      equalizeGoalQuadrants();
    };

    // Direct listeners (if present)
    const yes = document.querySelector('input[name="tr_apply_all"][value="yes"]');
    const no  = document.querySelector('input[name="tr_apply_all"][value="no"]');
    if(yes) yes.addEventListener("change", applyNow);
    if(no)  no.addEventListener("change", applyNow);

    const ry  = document.getElementById("tr_ry_global");
    if(ry){
      // Default OFF unless explicitly enabled (important: treat "0" as off)
      if(String(getGoalRaw("__META_TIRES","ry"))!=="1") ry.checked = false;
      ry.addEventListener("change", ryNow);
    }

    // Delegated fallback (survives re-render / overlay click targets)
    try{
      if(window.__tiresDelegatedHandler){
        document.removeEventListener("change", window.__tiresDelegatedHandler, true);
      }
      window.__tiresDelegatedHandler = (e)=>{
        // Only act when Goals view is mounted
        if(!document.querySelector(".goalsQuads")) return;
        const t = e.target;
        if(!t) return;
        if(t.id==="tr_ry_global" || t.name==="tr_apply_all"){
          // Update both states; order matters (RY affects disable logic)
          ryNow();
          applyNow();
        }
      };
      document.addEventListener("change", window.__tiresDelegatedHandler, true);
    }catch(_e){}

    // Initial apply
    ryNow();
    applyNow();
  }

    _wireUniversalCategory("__META_MAINTENANCE", MAINT);
  _wireUniversalCategory("__META_FLUIDS", FLUIDS);

_wireBrakes();
  _wireTires();


// Keep all 4 quadrants equal height, and large enough to fit the tallest one (usually Brakes).
let _eqT = null;
function equalizeGoalQuadrants(){
  // Tighten quadrants dynamically (no forced equal-height).
  const quads = Array.from(document.querySelectorAll(".goalsQuads .goalQuad"));
  if(!quads.length) return;
  quads.forEach(q=>{
    q.style.height = "auto";
    q.style.minHeight = "";
    q.classList.remove("equalH");
  });
}
requestAnimationFrame(equalizeGoalQuadrants);
window.addEventListener("resize", ()=>{
  clearTimeout(_eqT);
  _eqT = setTimeout(equalizeGoalQuadrants, 80);
});

  const saveBtn = document.getElementById("saveGoalsAll");
  if(saveBtn){
    saveBtn.addEventListener("click", ()=>{
      // Save everything we rendered (including leftovers + brakes special keys)
      const catsToSave = Array.from(new Set([
        ...MAINT, ...FLUIDS, ...BRAKES, ...TIRES, ...leftovers
      ]));
      catsToSave.forEach(cat=>{
        const catEnc = encodeURIComponent(cat);
        const elReq = document.getElementById(`g_${catEnc}_req`);
        const elClose = document.getElementById(`g_${catEnc}_close`);
        if(elReq) setGoalRaw(cat,"req", inputToGoal(elReq.value));
        if(elClose) setGoalRaw(cat,"close", inputToGoal(elClose.value));
      })
      if(fApply && FLUIDS && FLUIDS.length){
        const u = FLUIDS[0];
        const uReq = getGoalRaw(u,"req");
        const uClose = getGoalRaw(u,"close");
        FLUIDS.slice(1).forEach(c=>{
          setGoalRaw(c,"req", uReq);
          setGoalRaw(c,"close", uClose);
        });
      }

;
      // --- Brakes goals (4 fields + toggles) ---
      const applyAllYes = !!(document.querySelector('input[name="br_apply_all"][value="yes"]')?.checked);
      setGoalRaw("__META_BRAKES","apply_all", applyAllYes ? 1 : 0);

            const ryOnGlobal = !!document.getElementById("br_ry_global")?.checked;
      setGoalRaw("__META_BRAKES","ry", ryOnGlobal ? 1 : 0);
const _saveBrakeKey = (key, mappedCat)=>{
        const keyEnc = encodeURIComponent(key);
        const ryOn = !!document.getElementById("br_ry_global")?.checked;

        const rReq   = document.getElementById(`b_${keyEnc}_req_red`);
        const rClose = document.getElementById(`b_${keyEnc}_close_red`);
        const yReq   = document.getElementById(`b_${keyEnc}_req_yellow`);
        const yClose = document.getElementById(`b_${keyEnc}_close_yellow`);

        const rReqV   = rReq ? inputToGoal(rReq.value) : null;
        const rCloseV = rClose ? inputToGoal(rClose.value) : null;

        setGoalRaw(key,"req",   rReqV);
        setGoalRaw(key,"close", rCloseV);
if(ryOn){
          setGoalRaw(key,"req_y",   yReq ? inputToGoal(yReq.value) : null);
          setGoalRaw(key,"close_y", yClose ? inputToGoal(yClose.value) : null);
        }

        // Mirror red goals back to dataset category names when available
        if(mappedCat){
          setGoalRaw(mappedCat,"req",   rReqV);
          setGoalRaw(mappedCat,"close", rCloseV);
        }

        return { rReqV, rCloseV };
      };

      const totalSaved = _saveBrakeKey("BRAKES_TOTAL", BRAKES_FOUND.total);
      const frontSaved = _saveBrakeKey("BRAKES_FRONT", BRAKES_FOUND.front);
      const rearSaved  = _saveBrakeKey("BRAKES_REAR",  BRAKES_FOUND.rear);

      // If "ONE GOAL FOR ALL RECS?" is enabled, use TOTAL BRAKES & ROTORS as universal for Front/Rear (and hide/disable their R/Y inputs).
      if(applyAllYes){
        const uReq = getGoalRaw("BRAKES_TOTAL","req");
        const uClose = getGoalRaw("BRAKES_TOTAL","close");
        const uReqY = getGoalRaw("BRAKES_TOTAL","req_y");
        const uCloseY = getGoalRaw("BRAKES_TOTAL","close_y");
        [
          ["BRAKES_FRONT", BRAKES_FOUND.front],
          ["BRAKES_REAR",  BRAKES_FOUND.rear]
        ].forEach(([k, mappedCat])=>{
          setGoalRaw(k,"req", uReq);
          setGoalRaw(k,"close", uClose);
          if(ryOnGlobal){
            setGoalRaw(k,"req_y", uReqY);
            setGoalRaw(k,"close_y", uCloseY);
          }
          if(mappedCat){
            setGoalRaw(mappedCat,"req", uReq);
            setGoalRaw(mappedCat,"close", uClose);
            if(ryOnGlobal){
              setGoalRaw(mappedCat,"req_y", uReqY);
              setGoalRaw(mappedCat,"close_y", uCloseY);
            }
          }
        });
      }



      // Apply-to-all: overwrite front/rear dataset-category goals with total goals
      if(applyAllYes){
        if(BRAKES_FOUND.front){
          setGoalRaw(BRAKES_FOUND.front,"req", totalSaved.rReqV);
          setGoalRaw(BRAKES_FOUND.front,"close", totalSaved.rCloseV);
        }
        if(BRAKES_FOUND.rear){
          setGoalRaw(BRAKES_FOUND.rear,"req", totalSaved.rReqV);
          setGoalRaw(BRAKES_FOUND.rear,"close", totalSaved.rCloseV);
        }
      }

      // --- Tires goals (global + optional Red/Yellow) ---
      const tiresApplyAll = !!(document.querySelector('input[name="tr_apply_all"][value="yes"]')?.checked);
      const tiresRY = !!(document.getElementById("tr_ry_global")?.checked);
      setGoalRaw("__META_TIRES","apply_all", tiresApplyAll ? "1" : "0");
      setGoalRaw("__META_TIRES","ry", tiresRY ? "1" : "0");

      function _saveTireKey(key, mappedCat){
        const k = encodeURIComponent(key);
        const rReq   = sanitizeNum(document.getElementById(`t_${k}_req_red`)?.value);
        const rClose = sanitizeNum(document.getElementById(`t_${k}_close_red`)?.value);
        const yReq   = sanitizeNum(document.getElementById(`t_${k}_req_yellow`)?.value);
        const yClose = sanitizeNum(document.getElementById(`t_${k}_close_yellow`)?.value);

        setGoalRaw(key, "req", rReq);
        setGoalRaw(key, "close", rClose);
        setGoalRaw(key, "req_y", yReq);
        setGoalRaw(key, "close_y", yClose);

        if(mappedCat){
          setGoalRaw(mappedCat, "req", rReq);
          setGoalRaw(mappedCat, "close", rClose);
          setGoalRaw(mappedCat, "req_y", yReq);
          setGoalRaw(mappedCat, "close_y", yClose);
        }
      }

      _saveTireKey("TIRES_TOTAL2", TIRES_FOUND.total);
      _saveTireKey("TIRES_TWO",    TIRES_FOUND.two);
      _saveTireKey("TIRES_FOUR",   TIRES_FOUND.four);

      // If using one universal tire goal, mirror TOTAL SETS OF 2 TIRES across TWO/Four (including dataset category names)
      if(tiresApplyAll){
        const kt = encodeURIComponent("TIRES_TOTAL2");
        const tot = {
          rReq:   sanitizeNum(document.getElementById(`t_${kt}_req_red`)?.value),
          rClose: sanitizeNum(document.getElementById(`t_${kt}_close_red`)?.value),
          yReq:   sanitizeNum(document.getElementById(`t_${kt}_req_yellow`)?.value),
          yClose: sanitizeNum(document.getElementById(`t_${kt}_close_yellow`)?.value),
        };
        const mirror = (key, mappedCat)=>{
          setGoalRaw(key,"req",tot.rReq);
          setGoalRaw(key,"close",tot.rClose);
          setGoalRaw(key,"req_y",tot.yReq);
          setGoalRaw(key,"close_y",tot.yClose);
          if(mappedCat){
            setGoalRaw(mappedCat,"req",tot.rReq);
            setGoalRaw(mappedCat,"close",tot.rClose);
            setGoalRaw(mappedCat,"req_y",tot.yReq);
            setGoalRaw(mappedCat,"close_y",tot.yClose);
          }
        };
        mirror("TIRES_TWO",  TIRES_FOUND.two);
        mirror("TIRES_FOUR", TIRES_FOUND.four);
      }

      // Persist
      if(typeof persistGoals==="function") persistGoals();

      const old = saveBtn.textContent;
      saveBtn.textContent = "Saved";
      saveBtn.disabled = true;
      setTimeout(()=>{
        saveBtn.textContent = old;
        saveBtn.disabled = false;
      }, 900);
    });
  }
}
/* -------------------- Services & Settings routing helpers -------------------- */
function renderServicesHome(){
  // Querystring: ?team=all|express|kia&focus=asr|sold
  const hash = location.hash || "";
  const qs = hash.includes("?") ? hash.split("?")[1] : "";
  let teamKey = "all";
  let focus = "asr";
  if(qs){
    for(const part of qs.split("&")){
      const [k,v]=part.split("=");
      if(k==="team") teamKey = decodeURIComponent(v||"all") || "all";
      if(k==="focus") focus = decodeURIComponent(v||"asr") || "asr";
    }
  }

  const techs = getTechsByTeam(teamKey);
  const totalRos = techs.reduce((s,t)=>s+(Number(t.ros)||0),0);
  const avgOdo = totalRos ? techs.reduce((s,t)=>s+(Number(t.odo)||0)*(Number(t.ros)||0),0)/totalRos : 0;

  const allCats = getAllCategoriesSet();
  const groupKeys = Object.keys(GROUPS||{}).sort((a,b)=>String(a).localeCompare(String(b)));

  function groupStats(key){
    const g = GROUPS[key];
    const services = (g?.services||[]).filter(s=>allCats.has(s));
    if(!services.length){
      return {avgReq:null, avgClose:null, svcCount:0};
    }
    let reqSum=0, closeSum=0, nReq=0, nClose=0;
    for(const svc of services){
      // aggregate across techs
      let asr=0, sold=0;
      for(const t of techs){
        const c = (t.categories||{})[svc];
        asr += Number(c?.asr)||0;
        sold += Number(c?.sold)||0;
      }
      const req = totalRos ? (asr/totalRos) : null;
      const close = asr ? (sold/asr) : null;
      if(Number.isFinite(req)){ reqSum+=req; nReq++; }
      if(Number.isFinite(close)){ closeSum+=close; nClose++; }
    }
    return {
      avgReq: nReq ? (reqSum/nReq) : null,
      avgClose: nClose ? (closeSum/nClose) : null,
      svcCount: services.length
    };
  }

  const tiles = groupKeys.map(key=>{
    const g = GROUPS[key];
    const s = groupStats(key);
    const link = `#/group/${encodeURIComponent(key)}?team=${encodeURIComponent(teamKey)}&focus=${encodeURIComponent(focus)}`;
    const v1 = focus==="sold" ? fmtPct(s.avgClose) : fmtPctPlain(s.avgReq);
    const v2 = focus==="sold" ? fmtPctPlain(s.avgReq) : fmtPct(s.avgClose);
    const l1 = focus==="sold" ? "Avg Sold%" : "Avg ASR/RO";
    const l2 = focus==="sold" ? "Avg ASR/RO" : "Avg Sold%";
    return `
      <a class="catCard serviceCard" href="${link}" style="text-decoration:none;color:inherit">
        <div class="catHeader">
          <div>
            <div class="catTitle">${safe(g?.label||key)}</div>
            <div class="catCounts">${fmtInt(s.svcCount)} services</div>
          </div>
          <div class="catRank">
            <div class="rankNum">→</div>
            <div class="rankLbl">OPEN</div>
          </div>
        </div>
        <div class="techTilesRow">
          <div class="statTile t3">
            <div class="tLbl">${safe(l1)}</div>
            <div class="tVal">${v1}</div>
          </div>
          <div class="statTile t4">
            <div class="tLbl">${safe(l2)}</div>
            <div class="tVal">${v2}</div>
          </div>
        </div>
      </a>
    `;
  }).join("");

  const filters = `
    <div class="iconBar">
      <button class="iconBtn" onclick="toggleGroupFilters('_services_home')" aria-label="Filters" title="Filters">${ICON_FILTER}</button>
      <button class="iconBtn" onclick="openTechSearch()" aria-label="Search" title="Search">${ICON_SEARCH}</button>
    </div>
    <div class="ctlPanel ${(UI.groupFilters['_services_home'])?'open':''}">
      <div class="filtersRow">
        <div class="filter">
          <div class="smallLabel">Team</div>
          <select class="sel" id="svcTeam">
            <option value="all" ${teamKey==="all"?"selected":""}>All</option>
            <option value="express" ${teamKey==="express"?"selected":""}>Express</option>
            <option value="kia" ${teamKey==="kia"?"selected":""}>Kia</option>
          </select>
        </div>
        <div class="filter">
          <div class="smallLabel">Focus</div>
          <select class="sel" id="svcFocus">
            <option value="asr" ${focus==="asr"?"selected":""}>ASR/RO</option>
            <option value="sold" ${focus==="sold"?"selected":""}>Sold%</option>
          </select>
        </div>
      </div>
    </div>
  `;

  document.getElementById("app").innerHTML = `
    <div class="panel">
      <div class="phead">
        <div class="titleRow">
          <div>
            <div class="h2">SERVICES</div>
            <div class="sub"><a href="#/" style="text-decoration:none">← Back to technician dashboard</a></div>
          </div>
          <div>
            <div class="big">${fmtInt(totalRos)}</div>
            <div class="tag">ROs (Selected Team)</div>
          </div>
        </div>
        <div class="pills">
          <div class="pill"><div class="k">Team</div><div class="v">${safe(teamKey.toUpperCase())}</div></div>
          <div class="pill"><div class="k">Avg ODO</div><div class="v">${fmtInt(avgOdo)}</div></div>
        </div>
        ${filters}
      </div>
    </div>
    <div class="sectionFrame">
      <div class="categoryGrid">${tiles}</div>
    </div>
  `;

  const teamSel = document.getElementById("svcTeam");
  const focusSel = document.getElementById("svcFocus");
  const updateHash = ()=>{
    location.hash = `#/services?team=${encodeURIComponent(teamSel.value)}&focus=${encodeURIComponent(focusSel.value)}`;
  };
  if(teamSel && focusSel){
    teamSel.addEventListener("change", updateHash);
    focusSel.addEventListener("change", updateHash);
  }
}

function renderSettingsHome(){
  document.getElementById("app").innerHTML = `
    <div class="panel">
      <div class="phead">
        <div class="titleRow">
          <div>
            <div class="h2">SETTINGS</div>
            <div class="sub"><a href="#/" style="text-decoration:none">← Back to dashboard</a></div>
          </div>
        </div>
        <div class="list" style="margin-top:10px;display:grid;gap:10px">
          <a class="menuLink" href="#/settings/goals" style="display:block;border-radius:14px;background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid rgba(255,255,255,.08);padding:12px 14px;text-decoration:none;color:inherit">
            <div style="font-weight:1000;letter-spacing:.2px">Goals</div>
            <div class="sub" style="margin-top:4px">Set goal thresholds used on technician + service pages.</div>
          </a>
        </div>
      </div>
    </div>
  `;
}

function router(){
  const h = location.hash || "#/";
  document.body.classList.toggle("route-tech", h.startsWith("#/tech/"));

  if(h.startsWith("#/ros/")){
    const rest = h.slice("#/ros/".length);
    const techId = decodeURIComponent(rest.split("?")[0] || "");
    const qs = h.includes("?") ? h.split("?")[1] : "";
    let q="";
    if(qs){
      for(const part of qs.split("&")){
        const [k,v]=part.split("=");
        if(k==="q") q=decodeURIComponent(v||"");
      }
    }
    renderROListForTech(techId, q);
    return;
  }
  if(h.startsWith("#/group/")){
    const rest = h.slice("#/group/".length);
    const key = decodeURIComponent(rest.split("?")[0] || "");
    try{
      renderGroupPage(key);
    }catch(err){
      console.error(err);
      const msg = (err && (err.stack||err.message||String(err))) || "Unknown error";
      document.getElementById("app").innerHTML = `<div class="panel"><div class="h2">Could not load category page</div><div class="sub">${safe(msg)}</div></div>`;
    }
    return;
  }
  if(h.startsWith("#/settings/goals")){
    renderGoalsPage();
    return;
  }
  if(h==="#/settings" || h.startsWith("#/settings?")){
    renderSettingsHome();
    return;
  }
  if(h==="#/services" || h.startsWith("#/services?")){
    // Services Overview removed
    location.hash = "#/";
    return;
  }
  if(h.startsWith("#/goals")){
    // Backward compatibility
    location.hash = "#/settings/goals";
    return;
  }
  if(h.startsWith("#/tech/")){
    const rest = h.slice("#/tech/".length);
    const id = decodeURIComponent(rest.split("?")[0] || "");
    renderTech(id);
    return;
  }
  renderMain();
}



function normalizeRouteHrefs(){
  try{
    document.querySelectorAll('a[href]').forEach(a=>{
      const h = a.getAttribute('href')||"";
      const hashIdx = h.indexOf('#/');
      if(hashIdx>=0) a.setAttribute('href', h.slice(hashIdx));
    });
  }catch(e){}
}
function safeRouter(){
  try { router();
renderMenuTechLists(); normalizeRouteHrefs();
  }
  catch(e){
    const app = document.getElementById('app');
    if(app){
      app.innerHTML = '<div class="panel"><div class="phead"><div class="h2">Error</div><div class="sub">A script error occurred while rendering this view.</div></div>'
        + '<pre style="white-space:pre-wrap;padding:12px;color:var(--muted)">'+ safe((e&&e.stack)||String(e)) +'</pre></div>';
    } else {
      console.error(e);
      alert((e&&e.message)||String(e));
    }
  }
}

function goTech(id){
  // Navigate to a technician page reliably even if the hash doesn't change.
  const target = `#/tech/${encodeURIComponent(String(id))}`;
  if(location.hash !== target) location.hash = target;
  safeRouter();
  return false;
}









// Close menu on navigation
window.addEventListener("hashchange", ()=>{
  const t = document.getElementById("menuToggle");
  if(t) t.checked = false;
});


// delegateMenuLinks: make sure menu links navigate + close menu
document.addEventListener("click",(e)=>{
  const a = e.target.closest && e.target.closest("a.menuLink");
  if(!a) return;
  const href = a.getAttribute("href") || "";
  if(href.startsWith("#/")){
    e.preventDefault();
    if(location.hash === href){
      // if already on that hash, force re-render
      try{ router(); }catch(_e){}
    }else{
      location.hash = href;
      // some browsers delay hashchange while overlays are closing; force a render tick
      setTimeout(()=>{ try{ router(); }catch(_e){} }, 0);
    }
    const t = document.getElementById("menuToggle");
    if(t) t.checked = false;
  }
});

window.addEventListener('hashchange', safeRouter);
populateAsrMenuLinks();
initTechSearchModal();
try { safeRouter(); }
catch(e){
  document.getElementById('app').innerHTML = '<div class="panel"><div class="phead"><div class="h2">Dashboard error</div><div class="sub">Send a screenshot of this error.</div></div><div class="list"><pre style="white-space:pre-wrap;color:var(--muted)">'+safe(e.stack||String(e))+'</pre></div></div>';
}
