/* BVMI BMI Tracker (Vanilla JS) */
(function(){
  const $ = (id) => document.getElementById(id);

  const els = {
    tabs: Array.from(document.querySelectorAll('.tab')),
    viewCalc: $('view-calc'),
    viewRecords: $('view-records'),
    patientName: $('patientName'),
    unitMetric: $('unitMetric'),
    unitImperial: $('unitImperial'),
    metricFields: $('metricFields'),
    imperialFields: $('imperialFields'),
    heightCm: $('heightCm'),
    weightKg: $('weightKg'),
    heightFt: $('heightFt'),
    heightIn: $('heightIn'),
    weightLb: $('weightLb'),
    btnCompute: $('btnCompute'),
    btnSave: $('btnSave'),
    bmiValue: $('bmiValue'),
    bmiBadge: $('bmiBadge'),
    gaugeFill: $('gaugeFill'),
    summary: $('summary'),
    toast: $('toast'),
    miniRecorded: $('miniRecorded'),
    miniLastSaved: $('miniLastSaved'),

    // Records
    searchName: $('searchName'),
    btnSearch: $('btnSearch'),
    btnExport: $('btnExport'),
    recordsBody: $('recordsBody'),
    recordsMeta: $('recordsMeta'),
    trendChart: $('trendChart'),

    // Settings
    btnSettings: $('btnSettings'),
    settingsModal: $('settingsModal'),
    btnCloseSettings: $('btnCloseSettings'),
    apiBaseUrl: $('apiBaseUrl'),
    btnSaveApi: $('btnSaveApi'),
    btnResetApi: $('btnResetApi'),
  };

  const STORAGE_KEYS = {
    api: "BVMI_API_BASE_URL",
    lastSaved: "BVMI_LAST_SAVED",
    lastComputed: "BVMI_LAST_COMPUTED",
    lastPatient: "BVMI_LAST_PATIENT",
  };

  const API = {
    baseUrl(){
      const fromLocal = localStorage.getItem(STORAGE_KEYS.api);
      const fromConfig = (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) ? window.APP_CONFIG.apiBaseUrl : "";
      const url = (fromLocal || fromConfig || "").trim();
      return url.replace(/\/$/, "");
    },
    async request(path, opts={}){
      const base = API.baseUrl();
      if(!base) throw new Error("API Base URL not set. Click Settings and paste your API URL.");
      const res = await fetch(base + path, {
        ...opts,
        headers: {
          "Content-Type":"application/json",
          ...(opts.headers || {})
        }
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e){ data = { raw: text }; }
      if(!res.ok){
        const msg = (data && (data.message || data.error)) ? (data.message || data.error) : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return data;
    }
  };

  function showToast(msg, type="info"){
    els.toast.style.display = "block";
    els.toast.textContent = msg;
    els.toast.style.borderColor = type==="ok" ? "rgba(34,197,94,.35)" : type==="err" ? "rgba(239,68,68,.35)" : "rgba(255,255,255,.12)";
    els.toast.style.background = type==="ok" ? "rgba(34,197,94,.08)" : type==="err" ? "rgba(239,68,68,.08)" : "rgba(255,255,255,.05)";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>{ els.toast.style.display="none"; }, 3500);
  }

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function bmiCategory(bmi){
    // WHO adult categories
    if(bmi < 18.5) return {label:"Underweight", tone:"warn"};
    if(bmi < 25) return {label:"Normal", tone:"ok"};
    if(bmi < 30) return {label:"Overweight", tone:"warn"};
    return {label:"Obesity", tone:"err"};
  }

  function setBadge(cat){
    els.bmiBadge.textContent = cat.label;
    const border = cat.tone==="ok" ? "rgba(34,197,94,.35)" : cat.tone==="warn" ? "rgba(245,158,11,.35)" : "rgba(239,68,68,.35)";
    const bg = cat.tone==="ok" ? "rgba(34,197,94,.10)" : cat.tone==="warn" ? "rgba(245,158,11,.10)" : "rgba(239,68,68,.10)";
    els.bmiBadge.style.borderColor = border;
    els.bmiBadge.style.background = bg;
  }

  function gaugePercent(bmi){
    // Map 10..40 to 0..100, clamp
    const pct = ((bmi - 10) / (40 - 10)) * 100;
    return clamp(pct, 0, 100);
  }

  function formatDate(iso){
    try{
      const d = new Date(iso);
      return d.toLocaleString(undefined, {year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit"});
    } catch(e){
      return iso;
    }
  }

  function readNumber(el){
    const v = (el.value || "").trim();
    if(v==="") return null;
    const n = Number(v);
    if(Number.isNaN(n)) return null;
    return n;
  }

  function getUnits(){
    return els.unitMetric.classList.contains("active") ? "metric" : "imperial";
  }

  function switchUnits(units){
    const metric = units === "metric";
    els.unitMetric.classList.toggle("active", metric);
    els.unitImperial.classList.toggle("active", !metric);
    els.metricFields.classList.toggle("hidden", !metric);
    els.imperialFields.classList.toggle("hidden", metric);
    els.unitMetric.setAttribute("aria-selected", metric ? "true":"false");
    els.unitImperial.setAttribute("aria-selected", !metric ? "true":"false");
  }

  function computeBMI(){
    const patientName = (els.patientName.value || "").trim();
    if(!patientName) throw new Error("Enter patient name.");
    const units = getUnits();
    let heightM = null;
    let weightKg = null;

    if(units === "metric"){
      const hCm = readNumber(els.heightCm);
      const wKg = readNumber(els.weightKg);
      if(hCm === null || wKg === null) throw new Error("Enter height and weight.");
      heightM = hCm / 100.0;
      weightKg = wKg;
    } else {
      const ft = readNumber(els.heightFt);
      const inch = readNumber(els.heightIn);
      const lb = readNumber(els.weightLb);
      if(ft === null || inch === null || lb === null) throw new Error("Enter height and weight.");
      const totalIn = (ft * 12) + inch;
      const heightCm = totalIn * 2.54;
      heightM = heightCm / 100.0;
      weightKg = lb * 0.45359237;
    }

    if(heightM <= 0 || weightKg <= 0) throw new Error("Height/weight must be positive.");
    const bmi = weightKg / (heightM * heightM);
    const bmiRounded = Math.round(bmi * 10) / 10;

    const cat = bmiCategory(bmiRounded);
    return {
      patientName,
      units,
      bmi: bmiRounded,
      category: cat.label,
      inputs: units==="metric"
        ? { heightCm: Math.round(heightM*1000)/10, weightKg: Math.round(weightKg*10)/10 }
        : { heightFt: Math.floor((heightM*100/2.54)/12), heightIn: Math.round(((heightM*100/2.54)%12)*10)/10, weightLb: Math.round((weightKg/0.45359237)*10)/10 },
      computedAt: new Date().toISOString(),
    };
  }

  function renderResult(result){
    els.bmiValue.textContent = result.bmi.toFixed(1);
    const cat = bmiCategory(result.bmi);
    setBadge(cat);
    els.gaugeFill.style.width = gaugePercent(result.bmi).toFixed(1) + "%";

    const msg = {
      Underweight: "BMI is below the healthy range. Consider nutrition review and clinical context.",
      Normal: "BMI is within the healthy range. Maintain lifestyle and keep tracking trends.",
      Overweight: "BMI is above the healthy range. Consider activity + nutrition adjustments.",
      Obesity: "BMI is high. Consider structured plan + clinical consultation if needed."
    }[cat.label] || "";

    els.summary.innerHTML = `<b>${result.patientName}</b> • ${result.units==="metric" ? "Metric" : "Imperial"} • <b>${cat.label}</b><br>${msg}`;
    els.btnSave.disabled = false;

    localStorage.setItem(STORAGE_KEYS.lastComputed, JSON.stringify(result));
    localStorage.setItem(STORAGE_KEYS.lastPatient, result.patientName);
    updateMini();
  }

  function updateMini(){
    // recorded: count for last patient (local cache only)
    const lastPatient = localStorage.getItem(STORAGE_KEYS.lastPatient) || "";
    const cached = loadCachedRecords(lastPatient);
    els.miniRecorded.textContent = lastPatient ? String(cached.length) : "—";
    const lastSaved = localStorage.getItem(STORAGE_KEYS.lastSaved);
    els.miniLastSaved.textContent = lastSaved ? formatDate(lastSaved) : "—";
  }

  function loadCachedRecords(patientName){
    if(!patientName) return [];
    const key = `BVMI_CACHE_${patientName.toLowerCase()}`;
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch(e){ return []; }
  }

  function saveCachedRecords(patientName, records){
    const key = `BVMI_CACHE_${patientName.toLowerCase()}`;
    localStorage.setItem(key, JSON.stringify(records.slice(0, 200)));
  }

  async function saveToCloud(){
    const last = localStorage.getItem(STORAGE_KEYS.lastComputed);
    if(!last) throw new Error("Compute BMI first.");
    const payload = JSON.parse(last);

    const body = {
      patientName: payload.patientName,
      units: payload.units,
      heightCm: payload.units==="metric" ? payload.inputs.heightCm : null,
      weightKg: payload.units==="metric" ? payload.inputs.weightKg : null,
      heightFt: payload.units==="imperial" ? payload.inputs.heightFt : null,
      heightIn: payload.units==="imperial" ? payload.inputs.heightIn : null,
      weightLb: payload.units==="imperial" ? payload.inputs.weightLb : null,
      clientComputedAt: payload.computedAt
    };

    const data = await API.request("/records", { method:"POST", body: JSON.stringify(body) });

    localStorage.setItem(STORAGE_KEYS.lastSaved, new Date().toISOString());

    // cache latest for quick view
    const cached = loadCachedRecords(payload.patientName);
    const merged = [data.record, ...cached].filter((v, i, arr) => i === arr.findIndex(x => x.recordTs === v.recordTs));
    saveCachedRecords(payload.patientName, merged);

    updateMini();
    showToast("Saved to DynamoDB ✅", "ok");
  }

  function setView(view){
    const isCalc = view === "calc";
    document.querySelector('#view-calc').classList.toggle("show", isCalc);
    document.querySelector('#view-records').classList.toggle("show", !isCalc);
    els.tabs.forEach(t => t.classList.toggle("active", t.dataset.view === view));
  }

  function renderRecords(records){
    const rows = records.map(r => {
      const h = r.units==="metric" ? `${r.heightCm} cm` : `${r.heightFt} ft ${r.heightIn} in`;
      const w = r.units==="metric" ? `${r.weightKg} kg` : `${r.weightLb} lb`;
      return `<tr>
        <td>${formatDate(r.recordTs)}</td>
        <td>${Number(r.bmi).toFixed(1)}</td>
        <td>${r.category}</td>
        <td>${h}</td>
        <td>${w}</td>
      </tr>`;
    }).join("");

    els.recordsBody.innerHTML = rows || `<tr><td colspan="5" class="muted">No records found.</td></tr>`;
    els.btnExport.disabled = !(records && records.length);
    els.recordsMeta.textContent = records && records.length ? `Loaded ${records.length} record(s).` : "";
    drawTrend(records);
  }

  function exportCsv(records, patientName){
    const header = ["patientName","recordTs","bmi","category","units","heightCm","weightKg","heightFt","heightIn","weightLb"];
    const lines = [header.join(",")];
    records.forEach(r => {
      const row = header.map(k => {
        const v = (k==="patientName") ? patientName : (r[k] ?? "");
        const s = String(v).replace(/"/g,'""');
        return `"${s}"`;
      });
      lines.push(row.join(","));
    });
    const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(patientName||"records").replace(/\s+/g,"_")}_bmi.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function drawTrend(records){
    const canvas = els.trendChart;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    // HiDPI
    const dpr = window.devicePixelRatio || 1;
    if(canvas._dpr !== dpr){
      canvas._dpr = dpr;
      canvas.width = Math.floor(800 * dpr);
      canvas.height = Math.floor(420 * dpr);
    }
    const w = canvas.width, h = canvas.height;

    // Clear
    ctx.clearRect(0,0,w,h);

    // Padding
    const pad = 46 * dpr;
    const chartW = w - pad*2;
    const chartH = h - pad*2;

    // background grid
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    for(let i=0;i<=5;i++){
      const y = pad + (chartH * i/5);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad+chartW, y); ctx.stroke();
    }

    // bands (WHO)
    const bands = [
      {a: 0, b: 18.5, alpha:0.08},
      {a: 18.5, b: 25, alpha:0.06},
      {a: 25, b: 30, alpha:0.06},
      {a: 30, b: 45, alpha:0.06},
    ];
    const yFor = (bmi) => {
      const minY = 10, maxY = 40;
      const v = clamp(bmi, minY, maxY);
      const t = (v - minY) / (maxY - minY);
      return pad + chartH - (t*chartH);
    };
    bands.forEach((b, idx) => {
      const y1 = yFor(b.a), y2 = yFor(b.b);
      ctx.fillStyle = `rgba(124,92,255,${b.alpha})`;
      ctx.fillRect(pad, Math.min(y1,y2), chartW, Math.abs(y2-y1));
    });

    if(!records || records.length === 0){
      ctx.fillStyle = "rgba(168,179,214,.9)";
      ctx.font = `${14*dpr}px Inter, sans-serif`;
      ctx.fillText("No trend to display. Search a patient to load records.", pad, pad + 20*dpr);
      return;
    }

    const pts = records.slice(0, 30).slice().reverse(); // oldest -> newest

    // x scale
    const xFor = (i) => pad + (chartW * (i / Math.max(1, pts.length-1)));

    // line
    ctx.strokeStyle = "rgba(34,197,94,.95)";
    ctx.lineWidth = 2.5 * dpr;
    ctx.beginPath();
    pts.forEach((r,i) => {
      const x = xFor(i);
      const y = yFor(Number(r.bmi));
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // points
    ctx.fillStyle = "rgba(234,240,255,.95)";
    pts.forEach((r,i) => {
      const x = xFor(i);
      const y = yFor(Number(r.bmi));
      ctx.beginPath(); ctx.arc(x,y, 3.5*dpr, 0, Math.PI*2); ctx.fill();
    });

    // axes labels
    ctx.fillStyle = "rgba(168,179,214,.9)";
    ctx.font = `${12*dpr}px Inter, sans-serif`;
    ctx.fillText("BMI (10–40)", pad, pad - 10*dpr);
    ctx.fillText("Old → New", pad + chartW - 70*dpr, pad + chartH + 28*dpr);

    // y ticks
    const ticks = [10, 18.5, 25, 30, 40];
    ctx.font = `${11*dpr}px Inter, sans-serif`;
    ticks.forEach(t => {
      const y = yFor(t);
      ctx.fillText(String(t), 10*dpr, y + 4*dpr);
    });
  }

  async function searchRecords(){
    const name = (els.searchName.value || "").trim();
    if(!name) throw new Error("Enter patient name to search.");
    const data = await API.request(`/records?patientName=${encodeURIComponent(name)}`, { method:"GET" });
    const records = (data && data.records) ? data.records : [];
    saveCachedRecords(name, records); // keep a cache
    renderRecords(records);
    showToast("Loaded records ✅", "ok");
  }

  function openSettings(){
    els.apiBaseUrl.value = API.baseUrl();
    els.settingsModal.classList.remove("hidden");
  }
  function closeSettings(){
    els.settingsModal.classList.add("hidden");
  }
  function saveSettings(){
    const v = (els.apiBaseUrl.value || "").trim().replace(/\/$/, "");
    if(!v) throw new Error("Enter API Base URL.");
    localStorage.setItem(STORAGE_KEYS.api, v);
    closeSettings();
    showToast("API Base URL saved ✅", "ok");
  }
  function resetSettings(){
    localStorage.removeItem(STORAGE_KEYS.api);
    els.apiBaseUrl.value = "";
    showToast("Reset done.", "info");
  }

  // Wire UI
  els.tabs.forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));
  els.unitMetric.addEventListener("click", () => switchUnits("metric"));
  els.unitImperial.addEventListener("click", () => switchUnits("imperial"));

  els.btnCompute.addEventListener("click", () => {
    try{
      const result = computeBMI();
      renderResult(result);
      showToast("Computed ✅", "ok");
    } catch(e){
      showToast(e.message || String(e), "err");
    }
  });

  els.btnSave.addEventListener("click", async () => {
    els.btnSave.disabled = true;
    try{
      await saveToCloud();
    } catch(e){
      showToast(e.message || String(e), "err");
    } finally {
      els.btnSave.disabled = false;
    }
  });

  els.btnSearch.addEventListener("click", async () => {
    try{ await searchRecords(); } catch(e){ showToast(e.message || String(e), "err"); }
  });

  els.searchName.addEventListener("keydown", (ev) => {
    if(ev.key === "Enter"){ els.btnSearch.click(); }
  });

  els.btnExport.addEventListener("click", () => {
    const name = (els.searchName.value || "").trim();
    const records = loadCachedRecords(name);
    exportCsv(records, name);
  });

  // Settings modal
  els.btnSettings.addEventListener("click", openSettings);
  els.btnCloseSettings.addEventListener("click", closeSettings);
  els.btnSaveApi.addEventListener("click", () => { try{ saveSettings(); } catch(e){ showToast(e.message || String(e), "err"); } });
  els.btnResetApi.addEventListener("click", resetSettings);
  els.settingsModal.addEventListener("click", (ev) => {
    if(ev.target === els.settingsModal) closeSettings();
  });

  // boot
  (function init(){
    // preload last patient
    const lastPatient = localStorage.getItem(STORAGE_KEYS.lastPatient);
    if(lastPatient) els.patientName.value = lastPatient;
    updateMini();

    // prefill API url
    const api = API.baseUrl();
    if(api) els.apiBaseUrl.value = api;

    // prefill records search
    if(lastPatient) els.searchName.value = lastPatient;

    // render cached trend quickly
    if(lastPatient){
      const cached = loadCachedRecords(lastPatient);
      if(cached.length){
        renderRecords(cached);
      } else {
        drawTrend([]);
      }
    } else {
      drawTrend([]);
    }
  })();
})();
