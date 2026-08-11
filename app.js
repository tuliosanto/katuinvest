</script>
<script>
/* ============ Estado & persistência ============ */
const KEY='nosso_patrimonio_v1';
const CLASSES=[
  {id:'acoes',   nome:'Ações',    grupo:'rv', cor:'#1E6E5A'},
  {id:'cdb',     nome:'CDB',      grupo:'rf', cor:'#3C6E8F'},
  {id:'fii',     nome:'FII',      grupo:'rv', cor:'#5FA98C'},
  {id:'caixa',   nome:'Caixa',    grupo:'rf', cor:'#8FB4CC'},
  {id:'dolar',   nome:'Dólar',    grupo:'ext',cor:'#B0801F'},
  {id:'cripto',  nome:'Cripto',   grupo:'cri',cor:'#6B5B8F'},
  {id:'etf_bdr', nome:'ETF/BDR',  grupo:'rv', cor:'#93C47D'},
];
const GRUPOS=[
  {id:'rf', nome:'Renda Fixa',      cor:'#3C6E8F', membros:['cdb','caixa']},
  {id:'rv', nome:'Renda Variável',  cor:'#1E6E5A', membros:['acoes','fii','etf_bdr']},
  {id:'cri',nome:'Cripto',          cor:'#6B5B8F', membros:['cripto']},
  {id:'ext',nome:'Exterior (US$)',  cor:'#B0801F', membros:['dolar']},
];
const YEAR_ANCHORS={2021:238057.66, 2022:298010.45};
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESL=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let state={months:[],ativos:[]};
let allocMode='grupo';
let editIndex=null;
let hasStorage=true;

function seedState(){
  const months=SEED_DATA.map(r=>({
    date:r.date, acoes:r.acoes,cdb:r.cdb,fii:r.fii,caixa:r.caixa,dolar:r.dolar,cripto:r.cripto,etf_bdr:r.etf_bdr,
    aporte:r.aporte, dividendos:r.dividendos, obs:r.obs||'', precos:r.precos||{}
  }));
  const last=SEED_DATA[SEED_DATA.length-1];
  const ativos=(last.stocks||[]).map(s=>({id:"old_"+s.t, cat:"acoes", name:s.t, q:s.q}));
  return {months,ativos};
}
let db=null, auth=null;
async function load(){
  try{
    const snap=await db.collection('carteira').doc('dados').get();
    if(snap.exists && snap.data() && snap.data().payload){ state=JSON.parse(snap.data().payload); }
    else { state=seedState(); await save(); }
  }catch(e){
    hasStorage=false; state=seedState();
    console.error('Erro ao carregar da nuvem:',e);
  }
  migrateData(); sortMonths();
}
async function save(){
  if(!db) { hasStorage=false; return; }
  try{ await db.collection('carteira').doc('dados').set({payload:JSON.stringify(state), atualizado:Date.now()}); hasStorage=true; }
  catch(e){ hasStorage=false; console.error('Erro ao salvar na nuvem:',e); }
}
function migrateData() {
  if (state.holdings && !state.ativos) {
    state.ativos = state.holdings.map((h, i) => ({ id: 'old_acoes_'+i, cat: 'acoes', name: h.t, q: h.q }));
    delete state.holdings;
  }
  if (!state.ativos) state.ativos = [];
}
function sortMonths(){ state.months.sort((a,b)=>a.date<b.date?-1:1); }

/* ============ Cálculos ============ */
const total=m=>CLASSES.reduce((s,c)=>s+(+m[c.id]||0),0);
function computed(){
  const arr=state.months.map((m,i)=>{
    const t=total(m); const prev=i>0?total(state.months[i-1]):null;
    const varMes=prev===null?null:t-prev;
    const rend=varMes===null?null:varMes-(+m.aporte||0);
    return {...m,i,total:t,varMes,rend};
  });
  return arr;
}
const fmt=(v,d=2)=> (v==null||isNaN(v))?'—':v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const brl=(v,d=2)=> (v==null||isNaN(v))?'—':'R$ '+fmt(v,d);
const pct=(v,d=1)=> (v==null||isNaN(v))?'—':(v*100).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
function mLabel(date,long){const[y,mo]=date.split('-');const idx=+mo-1;return (long?MESL[idx]:MES[idx].replace(/^./,c=>c.toUpperCase()))+' '+(long?y:"'"+y.slice(2));}

/* ============ Navegação ============ */
document.getElementById('tabs').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b)return;
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('v-'+b.dataset.v).classList.add('active');
  if(b.dataset.v==='lancar') renderLancar();
  if(b.dataset.v==='projecoes') renderProjecoes();
  window.scrollTo({top:0,behavior:'smooth'});
});
function goTo(v){document.querySelector(`#tabs button[data-v="${v}"]`).click();}

/* ============ PAINEL ============ */
function renderPainel(){
  const C=computed(); const last=C[C.length-1];
  if(!last){document.getElementById('hero').innerHTML='<div class="empty">Nenhum lançamento ainda. Vá em <b>Novo lançamento</b> para começar.</div>';return;}
  // hero
  const up=(last.varMes||0)>=0;
  const carNote = last.i>0 ? '' : '';
  document.getElementById('hero').innerHTML=`
    <div>
      <div class="as-of">Posição em ${mLabel(last.date,true)}</div>
      <div class="big num">R$ ${fmt(Math.floor(last.total),0)}<span class="cents">,${fmt(last.total,2).split(',')[1]}</span></div>
      <span class="chg ${up?'up':'down'}"><span class="arrow">${up?'▲':'▼'}</span>${brl(Math.abs(last.varMes||0))} no mês</span>
      <div class="note">Desde dez/2023, o patrimônio da família cresceu ${brl(last.total-C[0].total)} — de ${brl(C[0].total)} para o valor de hoje.</div>
    </div>
    <div class="hero-chart" id="hero-chart"></div>`;
  areaChart('hero-chart',C,{h:180,mini:false});
  // stats YTD
  const yr=last.date.slice(0,4);
  const yrRows=C.filter(m=>m.date.slice(0,4)===yr);
  const aporteYTD=yrRows.reduce((s,m)=>s+(+m.aporte||0),0);
  const divYTD=yrRows.reduce((s,m)=>s+(+m.dividendos||0),0);
  const rendYTD=yrRows.reduce((s,m)=>s+(m.rend||0),0);
  const y0=C.find(m=>m.date.slice(0,4)===yr); const janBase=y0?y0.total-(y0.varMes||0):last.total;
  const pctYTD=janBase?((last.total-janBase)/janBase):null;
  const S=[
    {k:'Ganho no ano',dot:'var(--emerald)',v:brl(rendYTD,0),s:'rendimento do mercado em '+yr},
    {k:'Aportado no ano',dot:'var(--gold)',v:brl(aporteYTD,0),s:'dinheiro novo investido'},
    {k:'Dividendos no ano',dot:'var(--violet)',v:brl(divYTD,0),s:'proventos recebidos em '+yr},
    {k:'Crescimento no ano',dot:'var(--sky)',v:pct(pctYTD),s:'patrimônio desde jan/'+yr},
  ];
  document.getElementById('stats').innerHTML=S.map(x=>`
    <div class="card stat"><div class="k"><span class="dot" style="background:${x.dot}"></span>${x.k}</div>
    <div class="v num">${x.v}</div><div class="s">${x.s}</div></div>`).join('');
  renderAlloc(last);
  renderBars(C);
}

function renderAlloc(last){
  const items = allocMode==='grupo'
    ? GRUPOS.map(g=>({nome:g.nome,cor:g.cor,val:g.membros.reduce((s,id)=>s+(+last[id]||0),0)}))
    : CLASSES.map(c=>({nome:c.nome,cor:c.cor,val:+last[c.id]||0}));
  const tot=items.reduce((s,x)=>s+x.val,0);
  items.forEach(x=>x.pct=tot?x.val/tot:0);
  items.sort((a,b)=>b.val-a.val);
  donut('donut',items);
  document.getElementById('alloc-legend').innerHTML=items.map(x=>`
    <div class="row"><span class="dot" style="background:${x.cor}"></span>
    <span class="name">${x.nome}</span><span class="val num">${brl(x.val,0)}</span><span class="pct num">${pct(x.pct)}</span></div>`).join('');
}
document.getElementById('alloc-toggle').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b)return;
  allocMode=b.dataset.mode;
  document.querySelectorAll('#alloc-toggle button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const C=computed(); renderAlloc(C[C.length-1]);
});

/* ============ Gráficos SVG ============ */
function areaChart(id,C,opt={}){
  const el=document.getElementById(id); if(!el)return;
  const w=el.clientWidth||600, h=opt.h||180, pad={l:8,r:8,t:14,b:22};
  const vals=C.map(m=>m.total); const min=Math.min(...vals)*.985, max=Math.max(...vals)*1.01;
  const X=i=>pad.l+(w-pad.l-pad.r)*(C.length<2?.5:i/(C.length-1));
  const Y=v=>pad.t+(h-pad.t-pad.b)*(1-(v-min)/(max-min||1));
  let d='',a='';
  C.forEach((m,i)=>{const x=X(i),y=Y(m.total);d+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' ';});
  a=d+`L${X(C.length-1).toFixed(1)} ${h-pad.b} L${X(0).toFixed(1)} ${h-pad.b} Z`;
  // year gridlines
  let grid='';const seen={};
  C.forEach((m,i)=>{const y=m.date.slice(0,4);if(!seen[y]){seen[y]=1;grid+=`<line x1="${X(i)}" y1="${pad.t}" x2="${X(i)}" y2="${h-pad.b}" stroke="var(--line-soft)"/><text x="${X(i)}" y="${h-6}" font-size="10" fill="#9AA79F" text-anchor="middle">${y}</text>`;}});
  const dots=C.map((m,i)=>`<circle class="pt" data-i="${i}" cx="${X(i)}" cy="${Y(m.total)}" r="10" fill="transparent"/>`).join('');
  el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block">
    <defs><linearGradient id="ag-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1E6E5A" stop-opacity=".18"/><stop offset="1" stop-color="#1E6E5A" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${a}" fill="url(#ag-${id})"/><path d="${d}" fill="none" stroke="var(--emerald)" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="${X(C.length-1)}" cy="${Y(C[C.length-1].total)}" r="3.5" fill="var(--emerald)"/>${dots}</svg>
    <div class="chart-tt" id="tt-${id}"></div>`;
  const tt=document.getElementById('tt-'+id);
  el.querySelectorAll('.pt').forEach(c=>{
    c.addEventListener('mouseenter',()=>{const m=C[+c.dataset.i];const r=el.getBoundingClientRect();
      tt.style.left=(+c.getAttribute('cx')/w*r.width)+'px';tt.style.top=(+c.getAttribute('cy')/h*r.height)+'px';
      tt.innerHTML=`<b>${mLabel(m.date,true)}</b><br>${brl(m.total,0)}`;tt.style.opacity=1;});
    c.addEventListener('mouseleave',()=>tt.style.opacity=0);
  });
}
function donut(id,items){
  const el=document.getElementById(id);if(!el)return;
  const size=168,r=68,cx=size/2,cy=size/2,sw=26,C=2*Math.PI*r;
  const tot=items.reduce((s,x)=>s+x.val,0)||1;let off=0,segs='';
  items.forEach(x=>{const frac=x.val/tot;const len=frac*C;
    segs+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${x.cor}" stroke-width="${sw}" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"><title>${x.nome}: ${pct(frac)}</title></circle>`;
    off+=len;});
  el.innerHTML=`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="${sw}"/>${segs}
    <text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="12" fill="var(--ink-soft)">Total</text>
    <text x="${cx}" y="${cy+15}" text-anchor="middle" font-size="16" font-weight="700" fill="var(--emerald-deep)">${brl(tot,0).replace('R$ ','R$')}</text></svg>`;
}
function renderBars(C){
  const el=document.getElementById('bars');const data=C.slice(-12).filter(m=>m.varMes!==null);
  const w=el.clientWidth||700,h=210;
  const P={l:8,r:8,t:14,b:34};
  const maxA=Math.max(...data.map(m=>Math.max(m.aporte||0,Math.max(m.rend||0,0)))); 
  const minA=Math.min(0,...data.map(m=>Math.min(m.rend||0,0)));
  const span=(maxA-minA)||1;const zero=P.t+(h-P.t-P.b)*(maxA/span);
  const bw=(w-P.l-P.r)/data.length;const bar=Math.min(16,bw*0.32);
  const Y=v=>P.t+(h-P.t-P.b)*((maxA-v)/span);
  let g='';
  data.forEach((m,i)=>{const cx=P.l+bw*i+bw/2;
    const ha=Math.abs(Y(m.aporte||0)-zero),hr=Math.abs(Y(m.rend||0)-zero);
    const rneg=(m.rend||0)<0;
    g+=`<rect x="${cx-bar-1}" y="${(m.aporte||0)>=0?Y(m.aporte):zero}" width="${bar}" height="${ha}" rx="2" fill="var(--gold)"><title>${mLabel(m.date)} · Aporte ${brl(m.aporte||0,0)}</title></rect>`;
    g+=`<rect x="${cx+1}" y="${rneg?zero:Y(m.rend)}" width="${bar}" height="${hr}" rx="2" fill="${rneg?'var(--rose)':'var(--emerald)'}"><title>${mLabel(m.date)} · Rendimento ${brl(m.rend||0,0)}</title></rect>`;
    g+=`<text x="${cx}" y="${h-8}" text-anchor="middle" font-size="9.5" fill="#9AA79F">${MES[+m.date.split('-')[1]-1]}</text>`;
  });
  el.innerHTML=`<div style="display:flex;gap:16px;margin-bottom:6px;font-size:12.5px">
    <span><span class="dot" style="background:var(--gold);vertical-align:middle"></span> Aporte</span>
    <span><span class="dot" style="background:var(--emerald);vertical-align:middle"></span> Rendimento</span></div>
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}"><line x1="${P.l}" y1="${zero}" x2="${w-P.r}" y2="${zero}" stroke="var(--line)"/>${g}</svg>`;
}

/* ============ LANCAR ============ */
function renderLancar(){
  const C=computed();const prev=C[C.length-1];
  const form=document.getElementById('lancar-form');
  const base = editIndex!==null ? state.months[editIndex] : {};
  const today=new Date().toISOString().slice(0,10);
  const dateVal = editIndex!==null ? base.date : today;
  let html=`<div class="field" style="grid-column:1/-1;max-width:220px"><label>Data do fechamento</label>
    <div class="inp date"><input type="date" id="f-date" value="${dateVal}"></div></div>`;
  
  let html='';
  CLASSES.forEach(c=>{
    if(c.id === 'dolar') {
      html+=`<div class="field"><label style="color:${c.cor}">${c.nome}</label><div class="inp"><span class="pre">R$</span><input type="text" inputmode="decimal" data-f="${c.id}" value=""></div></div>`;
      return;
    }
    
    // Sub-ativos
    const ats = (state.ativos || []).filter(a => a.cat === c.id);
    if(ats.length === 0) {
      // Fallback: no sub-ativos created for this category
      html+=`<div class="field"><label style="color:${c.cor}">${c.nome}</label><div class="inp"><span class="pre">R$</span><input type="text" inputmode="decimal" data-f="${c.id}" value=""></div><div class="hint" style="font-size:11px;margin-top:4px">Vá em "Meus Ativos" para detalhar</div></div>`;
    } else {
      // Container for category
      html+=`<div style="grid-column:1/-1;background:var(--line-soft);padding:14px;border-radius:12px;margin-top:8px">
        <h4 style="margin:0 0 12px;color:${c.cor};font-size:14px;display:flex;justify-content:space-between">
          ${c.nome} <span id="tot-cat-${c.id}" style="color:var(--ink)">R$ 0,00</span>
        </h4>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">`;
      
      ats.forEach(a => {
        html+=`<div class="field"><label>${a.name}</label><div class="inp"><span class="pre">R$</span><input type="text" inputmode="decimal" data-subf="${c.id}" data-id="${a.id}" class="sub-input-${c.id}" oninput="calcCatTotal('${c.id}')"></div></div>`;
      });
      html+=`</div></div>`;
    }
  });

  html+=`<div class="field"><label>Aporte do mês <span class="hint">dinheiro novo</span></label>
    <div class="inp"><span class="pre">R$</span><input type="text" inputmode="decimal" data-f="aporte" value="${editIndex!==null?fmtInput(base.aporte):''}" placeholder="0,00"></div></div>
    <div class="field"><label>Dividendos recebidos</label>
    <div class="inp"><span class="pre">R$</span><input type="text" inputmode="decimal" data-f="dividendos" value="${editIndex!==null?fmtInput(base.dividendos):''}" placeholder="0,00"></div></div>`;
  html+=`<div class="field" style="grid-column:1/-1"><label>Observação <span class="hint">opcional — ex: vendi dólar, fiz cirurgia...</span></label>
    <div class="inp" style="align-items:stretch"><textarea id="f-obs" rows="2" placeholder="Alguma nota sobre este mês?" style="width:100%;border:none;outline:none;background:transparent;font:inherit;resize:vertical;padding:10px 12px">${editIndex!==null?(base.obs||''):''}</textarea></div></div>`;
  form.innerHTML=html;
  const precos=document.getElementById('lancar-precos');
  const pdefs=[['dolar','Dólar (R$)'],['btc','Bitcoin (R$)'],['ltc','Litecoin (R$)'],['xrp','XRP (R$)']];
  precos.innerHTML=pdefs.map(([k,l])=>`<div class="field"><label>${l}</label><div class="inp"><span class="pre">R$</span>
    <input type="text" inputmode="decimal" data-p="${k}" value="${editIndex!==null&&base.precos?fmtInput(base.precos[k]):''}" placeholder="0,00"></div></div>`).join('');
  document.getElementById('lancar-title').textContent = editIndex!==null?('Editando '+mLabel(base.date,true)):'Novo lançamento';
  document.getElementById('cancel-edit').style.display = editIndex!==null?'inline-block':'none';
  document.getElementById('copy-bar').style.display = (editIndex===null&&prev)?'flex':'none';
  form.querySelectorAll('input').forEach(inp=>inp.addEventListener('input',updatePreview));
  document.getElementById('f-date').addEventListener('change',updatePreview);
  updatePreview();
}
function fmtInput(v){return (v==null||v==='')?'':(+v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function parseNum(s){if(s==null)return 0;s=(''+s).trim();if(!s)return 0;s=s.replace(/\./g,'').replace(',','.');const n=parseFloat(s);return isNaN(n)?0:n;}
function readForm(){
  const o={ ativos: {} };
  
  // Generic / fallback
  document.querySelectorAll('#lancar-form input[data-f]').forEach(i => o[i.dataset.f] = parseNum(i.value) || 0);
  
  // Sub-ativos
  CLASSES.forEach(c => {
    if(c.id === 'dolar') return;
    const subs = document.querySelectorAll(`#lancar-form input[data-subf="${c.id}"]`);
    if(subs.length > 0) {
      let sum = 0;
      subs.forEach(i => {
        const val = parseNum(i.value) || 0;
        sum += val;
        o.ativos[i.dataset.id] = val;
      });
      o[c.id] = sum; // The total category field is the sum of sub-ativos
    }
  });
  o.date=document.getElementById('f-date').value;
  const obsEl=document.getElementById('f-obs');o.obs=obsEl?obsEl.value.trim():'';
  o.precos={};document.querySelectorAll('#lancar-precos input[data-p]').forEach(i=>{const v=parseNum(i.value);if(v)o.precos[i.dataset.p]=v;});
  return o;
}
function updatePreview(){
  const o=readForm();const t=CLASSES.reduce((s,c)=>s+(+o[c.id]||0),0);
  const C=computed();let prevTotal=null;
  const others=state.months.filter((m,idx)=>idx!==editIndex && m.date<o.date);
  if(others.length)prevTotal=total(others[others.length-1]);
  else if(editIndex!==null&&editIndex>0)prevTotal=total(state.months[editIndex-1]);
  const varMes=(prevTotal===null||t===0)?null:t-prevTotal;const rend=varMes===null?null:varMes-(+o.aporte||0);
  const up=(varMes||0)>=0;
  document.getElementById('lancar-preview').innerHTML=`
    <div class="pv"><div class="k">Total</div><div class="v num">${brl(t,0)}</div></div>
    <div class="pv"><div class="k">Variação</div><div class="v num" style="color:${varMes===null?'var(--ink)':(up?'var(--emerald)':'var(--rose)')}">${varMes===null?'—':(up?'+':'−')+brl(Math.abs(varMes),0).replace('R$ ','R$ ')}</div></div>
    <div class="pv"><div class="k">Rendimento</div><div class="v num" style="color:${rend===null?'var(--ink)':(rend>=0?'var(--emerald)':'var(--rose)')}">${rend===null?'—':(rend>=0?'+':'−')+brl(Math.abs(rend),0).replace('R$ ','R$ ')}</div></div>`;
}
document.getElementById('copy-prev').addEventListener('click',()=>{
  const C=computed();const prev=C[C.length-1];if(!prev)return;
  CLASSES.forEach(c=>{
    // Generic
    const el=document.querySelector(`#lancar-form input[data-f="${c.id}"]`);
    if(el) el.value = fmtInput(prev[c.id]);
    
    // Sub-ativos
    if(prev.ativos) {
      document.querySelectorAll(`#lancar-form input[data-subf="${c.id}"]`).forEach(i => {
        if(prev.ativos[i.dataset.id] !== undefined) {
          i.value = fmtInput(prev.ativos[i.dataset.id]);
        }
      });
      calcCatTotal(c.id);
    }
  });
  if(prev.precos)document.querySelectorAll('#lancar-precos input[data-p]').forEach(i=>{if(prev.precos[i.dataset.p])i.value=fmtInput(prev.precos[i.dataset.p]);});
  updatePreview();toast('Valores do mês anterior copiados. Agora é só ajustar.');
});
document.getElementById('save-month').addEventListener('click',()=>{
  const o=readForm();
  if(!o.date){toast('Escolha a data do fechamento.',true);return;}
  const dupIdx=state.months.findIndex((m,idx)=>m.date===o.date && idx!==editIndex);
  if(dupIdx>=0){toast('Já existe um lançamento nessa data. Edite-o no Histórico.',true);return;}
  if(editIndex!==null){state.months[editIndex]=o;editIndex=null;toast('Lançamento atualizado.');}
  else{state.months.push(o);toast('Lançamento salvo! 🎉');}
  migrateData(); sortMonths();save();renderAll();goTo('painel');
});
document.getElementById('cancel-edit').addEventListener('click',()=>{editIndex=null;renderLancar();goTo('historico');});

/* ============ HISTORICO ============ */
function renderHistorico(){
  const C=computed();const sel=document.getElementById('hist-year');
  const years=[...new Set(C.map(m=>m.date.slice(0,4)))].sort().reverse();
  const cur=sel.value||'todos';
  sel.innerHTML='<option value="todos">Todos</option>'+years.map(y=>`<option value="${y}" ${y===cur?'selected':''}>${y}</option>`).join('');
  const rows=C.slice().reverse().filter(m=>cur==='todos'||m.date.slice(0,4)===cur);
  const t=document.getElementById('hist-table');
  t.innerHTML=`<thead><tr><th>Mês</th><th>Total</th><th>Variação</th><th>%</th><th>Aporte</th><th>Dividendos</th><th></th></tr></thead><tbody>${
    rows.map(m=>{const p=m.varMes!==null&&m.total-m.varMes?m.varMes/(m.total-m.varMes):null;
    return `<tr><td>${mLabel(m.date,true)}</td><td class="num">${brl(m.total,0)}</td>
    <td class="num ${m.varMes===null?'':(m.varMes>=0?'pos':'neg')}">${m.varMes===null?'—':(m.varMes>=0?'+':'−')+fmt(Math.abs(m.varMes),0)}</td>
    <td class="num ${p===null?'':(p>=0?'pos':'neg')}">${p===null?'—':(p>=0?'+':'−')+pct(Math.abs(p))}</td>
    <td class="num">${brl(m.aporte||0,0)}</td><td class="num">${brl(m.dividendos||0,0)}</td>
    <td><div class="mono-act">
      ${m.obs?`<button class="icon-btn" title="Ver observação" onclick="viewNote(${m.i})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 001 1h4"/><path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/><path d="M9 13h6M9 17h4"/></svg></button>`:''}
      <button class="icon-btn" title="Editar" onclick="editMonth(${m.i})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg></button>
      <button class="icon-btn del" title="Excluir" onclick="delMonth(${m.i})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
    </div></td></tr>`;}).join('')}</tbody>`;
  if(!rows.length)t.innerHTML='<tbody><tr><td colspan="7"><div class="empty">Nenhum lançamento neste período.</div></td></tr></tbody>';
}
document.getElementById('hist-year').addEventListener('change',renderHistorico);
window.editMonth=i=>{editIndex=i;goTo('lancar');renderLancar();};
window.delMonth=i=>{const m=state.months[i];confirmModal('Excluir lançamento?',`O registro de <b>${mLabel(m.date,true)}</b> será removido. Isso não pode ser desfeito.`,()=>{state.months.splice(i,1);save();renderAll();toast('Lançamento excluído.');});};

/* ============ ACOES ============ */
function renderAtivos(){
  const el=document.getElementById('ativos-container');
  if(!state.ativos || !state.ativos.length){
    el.innerHTML='<div class="empty">Nenhum ativo cadastrado. Clique em <b>+ Adicionar ativo</b>.</div>';
    return;
  }
  let html = '';
  CLASSES.forEach(c => {
    if(c.id === 'dolar') return; // Dolar is not part of sub-ativos
    const ats = state.ativos.filter(a => a.cat === c.id);
    if(ats.length === 0) return;
    
    let cards = ats.map((a, i) => {
      const gIndex = state.ativos.indexOf(a);
      return `<div class="card hold" style="flex:1;min-width:160px;padding:12px;display:flex;gap:8px;align-items:center;background:var(--card)">
        <input type="text" value="${a.name}" onchange="updAtivo(${gIndex},'name',this.value)" style="flex:1;border:none;background:transparent;font-weight:600;font-size:15px;color:var(--ink);outline:none" placeholder="Nome do ativo">
        <button class="icon-btn del rm" onclick="rmAtivo(${gIndex})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>`;
    }).join('');
    
    html += `<div><h3 style="font-size:14px;color:${c.cor};margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em">${c.nome}</h3><div style="display:flex;gap:12px;flex-wrap:wrap">${cards}</div></div>`;
  });
  el.innerHTML = html;
}
window.updAtivo=(i,f,v)=>{state.ativos[i][f]=v;save();};
window.rmAtivo=i=>{state.ativos.splice(i,1);save();renderAtivos();};
document.getElementById('add-ativo').addEventListener('click',()=>{
  let opts = CLASSES.filter(c=>c.id!=='dolar').map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  document.getElementById('modal-title').textContent='Novo Ativo';
  document.getElementById('modal-text').innerHTML=
    `<label style="font-size:13px;color:var(--ink-soft);display:block;margin-bottom:4px">Categoria</label>
     <select id="new-ativo-cat" class="inp" style="width:100%;padding:10px;margin-bottom:12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)">${opts}</select>
     <label style="font-size:13px;color:var(--ink-soft);display:block;margin-bottom:4px">Nome do ativo</label>
     <input type="text" id="new-ativo-name" class="inp" placeholder="Ex: CDB Banco Master" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)">`;
  
  modalCb = () => {
    const cat = document.getElementById('new-ativo-cat').value;
    const name = document.getElementById('new-ativo-name').value.trim();
    if(name){
      state.ativos.push({id: 'a_'+Date.now(), cat, name});
      save(); renderAtivos();
    }
  };
  const cancel=document.getElementById('modal-cancel'),ok=document.getElementById('modal-ok');
  cancel.style.display='inline-block';ok.textContent='Adicionar';ok.className='btn primary';
  document.getElementById('modal').classList.add('show');
});

function renderAtivos(){
  const el=document.getElementById('holdings');
  if(!state.holdings.length){el.innerHTML='<div class="empty" style="grid-column:1/-1">Nenhum papel cadastrado. Clique em <b>+ Adicionar papel</b>.</div>';return;}
  el.innerHTML=state.holdings.map((s,i)=>`<div class="card hold">
    <input class="tk" style="border:none;font-weight:600;padding:0;font-size:15px" value="${s.t}" onchange="updStock(${i},'t',this.value)">
    <div class="qwrap"><input type="text" inputmode="numeric" value="${s.q}" onchange="updStock(${i},'q',this.value)"></div>
    <button class="icon-btn del rm" title="Remover" onclick="rmStock(${i})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
  </div>`).join('');
}
window.updStock=(i,f,v)=>{state.holdings[i][f]=f==='q'?(parseInt((''+v).replace(/\D/g,''))||0):(''+v).toUpperCase().trim();save();if(f==='t')renderAtivos();};
window.rmStock=i=>{state.holdings.splice(i,1);save();renderAtivos();};
document.getElementById('add-stock').addEventListener('click',()=>{state.holdings.push({t:'NOVO3',q:0});save();renderAtivos();});

/* ============ RELATORIO ============ */
function renderRelatorio(){
  const C=computed();const byYear={};
  C.forEach(m=>{const y=m.date.slice(0,4);byYear[y]=byYear[y]||[];byYear[y].push(m);});
  const rows=[];const anchorYears=Object.keys(YEAR_ANCHORS).map(Number);
  let prevEnd=null;
  const allYears=[...new Set([...anchorYears,...Object.keys(byYear).map(Number)])].sort();
  allYears.forEach(y=>{
    let end,note='';
    if(byYear[y]){end=byYear[y][byYear[y].length-1].total;
      if(y==new Date().getFullYear())note='ano em andamento';}
    else end=YEAR_ANCHORS[y];
    const ganho=prevEnd!==null?end-prevEnd:null;
    const perc=prevEnd?ganho/prevEnd:null;
    const nmes=byYear[y]?byYear[y].length:12;
    rows.push({y,end,ganho,perc,med:ganho!==null?ganho/nmes:null,note});
    prevEnd=end;
  });
  const t=document.getElementById('rel-table');
  const lastRec=C[C.length-1]; const lastYear=lastRec?+lastRec.date.slice(0,4):null;
  const lastMonthNo=lastRec?+lastRec.date.slice(5,7):12;
  rows.forEach(r=>{const div=(r.y===lastYear)?lastMonthNo:12; r.med=r.ganho!==null?r.ganho/div:null;});
  t.innerHTML=`<thead><tr><th>Ano</th><th>Patrimônio</th><th>Ganho no ano</th><th>Ganho médio/mês</th><th>% aumento</th></tr></thead><tbody>${
    rows.map(r=>`<tr><td><span class="year-chip">${r.y}</span>${r.note?` <span style="color:#9AA79F;font-size:12px">· ${r.note}</span>`:''}</td>
    <td class="num">${brl(r.end,0)}</td>
    <td class="num ${r.ganho===null?'':(r.ganho>=0?'pos':'neg')}">${r.ganho===null?'—':(r.ganho>=0?'+':'−')+brl(Math.abs(r.ganho),0).replace('R$ ','R$ ')}</td>
    <td class="num">${r.med===null?'—':brl(r.med,0)}</td>
    <td class="num ${r.perc===null?'':(r.perc>=0?'pos':'neg')}">${r.perc===null?'—':(r.perc>=0?'+':'−')+pct(Math.abs(r.perc))}</td></tr>`).join('')
  }</tbody>`;
  // year bar chart
  relBars(rows);
}
function relBars(rows){
  const el=document.getElementById('rel-chart');const w=el.clientWidth||700,h=230,P={l:8,r:8,t:16,b:28};
  const max=Math.max(...rows.map(r=>r.end))*1.05;const bw=(w-P.l-P.r)/rows.length;const bar=Math.min(46,bw*0.5);
  const Y=v=>P.t+(h-P.t-P.b)*(1-v/max);
  let g='';rows.forEach((r,i)=>{const cx=P.l+bw*i+bw/2;const y=Y(r.end);
    g+=`<rect x="${cx-bar/2}" y="${y}" width="${bar}" height="${h-P.b-y}" rx="4" fill="var(--emerald)" opacity="${r.note?'.55':'1'}"><title>${r.y}: ${brl(r.end,0)}</title></rect>`;
    g+=`<text x="${cx}" y="${y-6}" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--emerald-deep)">${(r.end/1000).toFixed(0)}k</text>`;
    g+=`<text x="${cx}" y="${h-8}" text-anchor="middle" font-size="11" fill="#9AA79F">${r.y}</text>`;});
  el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${g}</svg>`;
}

/* ============ PROJEÇÕES ============ */
function projBase(){
  const C=computed().filter(m=>m.varMes!==null); // exclui o 1º mês (sem variação anterior)
  const per=+document.getElementById('proj-periodo').value;
  const slice = per>0 ? C.slice(-per) : C;
  if(slice.length<2) return null;
  const nAporte=slice.length;
  const avgAporte = slice.reduce((s,m)=>s+(+m.aporte||0),0)/nAporte;
  // taxa média de rentabilidade mensal: rendimento do mês / total do mês anterior
  const rates=[];
  slice.forEach(m=>{
    const idx=m.i, prevTotal=idx>0?computed()[idx-1].total:null;
    if(prevTotal && prevTotal>0 && m.rend!=null) rates.push(m.rend/prevTotal);
  });
  const avgRate = rates.length ? rates.reduce((a,b)=>a+b,0)/rates.length : 0;
  const lastTotal = C[C.length-1].total;
  const lastDate = C[C.length-1].date;
  return {avgAporte, avgRate, lastTotal, lastDate, meses:slice.length};
}

function renderProjBase(){
  const b=projBase();
  const el=document.getElementById('proj-base');
  if(!b){ el.innerHTML='<p class="tip">Histórico insuficiente para calcular uma média (precisa de pelo menos 2 meses no período escolhido).</p>'; return; }
  el.innerHTML=`
    <div class="ps"><b>${brl(b.avgAporte,0)}</b><span>aporte médio / mês</span></div>
    <div class="ps"><b>${pct(b.avgRate,2)}</b><span>rentabilidade média / mês</span></div>
    <div class="ps"><b>${brl(b.lastTotal,0)}</b><span>patrimônio atual (${mLabel(b.lastDate,true)})</span></div>
    <div class="ps"><b>${b.meses}</b><span>meses usados na média</span></div>`;
}

function addMonthsToDate(dateStr,n){
  const[y,m]=dateStr.split('-').map(Number);
  const d=new Date(y,m-1+n,1);
  return MESL[d.getMonth()]+' de '+d.getFullYear();
}
const mesStr=n=>n+(n===1?' mês':' meses');

// Simula mês a mês: total = total*(1+taxa) + aporte, até bater o alvo. Retorna nº de meses ou null se nunca (com o ritmo atual).
function monthsToReach(startTotal,target,rate,aporte){
  if(startTotal>=target) return 0;
  if(rate<=0 && aporte<=0) return null;
  let t=startTotal, months=0;
  const LIMIT=1200; // 100 anos, trava de segurança
  while(t<target && months<LIMIT){ t = t*(1+rate) + aporte; months++; }
  return t>=target ? months : null;
}

function renderProjAlvoResult(){
  const b=projBase(); const el=document.getElementById('proj-result-alvo');
  const alvo=parseNum(document.getElementById('proj-alvo').value);
  if(!b){el.innerHTML='';return;}
  if(!alvo||alvo<=0){ el.innerHTML='<p class="proj-warn pr-warn">Informe um valor de patrimônio alvo.</p>'; return; }
  if(alvo<=b.lastTotal){ el.innerHTML=`<p class="pr-big">🎉 Vocês já passaram desse valor!</p><p class="pr-sub">Patrimônio atual: ${brl(b.lastTotal,0)}.</p>`; return; }
  const months=monthsToReach(b.lastTotal,alvo,b.avgRate,b.avgAporte);
  if(months===null){ el.innerHTML=`<p class="pr-warn">Nesse ritmo (aportes e rentabilidade dos últimos ${b.meses} meses), não é possível projetar quando esse valor seria atingido — a média de rentabilidade e aporte do período está muito baixa ou negativa.</p>`; return; }
  const anos=Math.floor(months/12), resto=months%12;
  el.innerHTML=`<p class="pr-big">${addMonthsToDate(b.lastDate,months)}</p>
    <p class="pr-sub">Isso é daqui a aproximadamente <b>${months} meses</b> (${anos>0?anos+' ano'+(anos>1?'s':'')+(resto>0?' e '+mesStr(resto):''):mesStr(resto)}), mantendo o ritmo médio de aporte e rentabilidade do período escolhido.</p>`;
}

function renderProjRendaResult(){
  const b=projBase(); const el=document.getElementById('proj-result-renda');
  const renda=parseNum(document.getElementById('proj-renda').value);
  const taxa=parseNum(document.getElementById('proj-taxa').value)/100;
  if(!b){el.innerHTML='';return;}
  if(!renda||renda<=0){ el.innerHTML='<p class="pr-warn">Informe a renda mensal desejada.</p>'; return; }
  if(!taxa||taxa<=0){ el.innerHTML='<p class="pr-warn">Informe uma taxa de retirada mensal maior que zero.</p>'; return; }
  const alvo = renda/taxa;
  const months=monthsToReach(b.lastTotal,alvo,b.avgRate,b.avgAporte);
  const jaTem = alvo<=b.lastTotal;
  let head = jaTem
    ? `<p class="pr-big">🎉 Vocês já têm patrimônio suficiente!</p>`
    : (months===null
        ? `<p class="pr-warn">Nesse ritmo, não é possível projetar quando esse patrimônio seria atingido.</p>`
        : `<p class="pr-big">${addMonthsToDate(b.lastDate,months)}</p>`);
  const anos=months?Math.floor(months/12):0, resto=months?months%12:0;
  el.innerHTML=`${head}
    <p class="pr-sub">Para sacar ${brl(renda,0)}/mês a uma taxa de ${pct(taxa,2)} ao mês, é preciso ter <b>${brl(alvo,0)}</b> de patrimônio.${!jaTem&&months!==null?` Isso é daqui a aproximadamente <b>${months} meses</b>${anos>0?' ('+anos+' ano'+(anos>1?'s':'')+(resto>0?' e '+mesStr(resto):'')+')':''}.`:''}</p>
    <p class="pr-sub" style="margin-top:6px">💡 A "regra dos 4% ao ano" (~0,33%/mês) é uma referência comum e conservadora para retiradas que preservam o patrimônio a longo prazo. Ajuste a taxa conforme a estratégia de vocês.</p>`;
}

function renderProjecoes(){ renderProjBase(); renderProjAlvoResult(); renderProjRendaResult(); }
document.getElementById('proj-periodo').addEventListener('change',renderProjecoes);
document.getElementById('proj-calc-alvo').addEventListener('click',renderProjAlvoResult);
document.getElementById('proj-calc-renda').addEventListener('click',renderProjRendaResult);

/* ============ DADOS / BACKUP ============ */
function download(name,content,type){const b=new Blob([content],{type});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
document.getElementById('exp-json').addEventListener('click',()=>{
  download(`nosso-patrimonio-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(state,null,1),'application/json');
  toast('Backup baixado.');
});
document.getElementById('imp-json').addEventListener('click',()=>document.getElementById('imp-file').click());
document.getElementById('imp-file').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{try{const d=JSON.parse(rd.result);if(!d.months)throw 0;state=d;migrateData(); sortMonths();save();renderAll();toast('Backup restaurado com sucesso.');goTo('painel');}catch(err){toast('Arquivo inválido.',true);}};
  rd.readAsText(f);e.target.value='';
});
document.getElementById('exp-csv').addEventListener('click',()=>{
  const C=computed();const head=['Data','Acoes','CDB','FII','Caixa','Dolar','Cripto','ETF_BDR','Total','Aporte','Dividendos','Variacao','Rendimento','Observacao'];
  const lines=[head.join(';')];
  C.forEach(m=>lines.push([m.date,m.acoes,m.cdb,m.fii,m.caixa,m.dolar,m.cripto,m.etf_bdr,m.total.toFixed(2),m.aporte||0,m.dividendos||0,m.varMes==null?'':m.varMes.toFixed(2),m.rend==null?'':m.rend.toFixed(2),(m.obs||'').replace(/;/g,',')].map(x=>(''+x).replace('.',',')).join(';')));
  download(`nosso-patrimonio-${new Date().toISOString().slice(0,10)}.csv`,'\ufeff'+lines.join('\n'),'text/csv');
  toast('Planilha exportada.');
});
document.getElementById('reset').addEventListener('click',()=>{
  confirmModal('Recarregar histórico original?','Todos os lançamentos e edições atuais serão substituídos pelos dados originais das planilhas. Faça um backup antes se quiser guardar o estado atual.',()=>{
    state=seedState();save();renderAll();toast('Histórico original recarregado.');goTo('painel');});
});
document.getElementById('logout').addEventListener('click',()=>{
  confirmModal('Sair da conta?','Você precisará entrar de novo com e-mail e senha. Seus dados continuam salvos na nuvem.',()=>{
    if(auth)auth.signOut().then(()=>location.reload());
  });
});

/* ============ Modal & toast ============ */
let modalCb=null;
function confirmModal(title,text,cb){
  document.getElementById('modal-title').textContent=title;document.getElementById('modal-text').innerHTML=text;modalCb=cb;
  const cancel=document.getElementById('modal-cancel'),ok=document.getElementById('modal-ok');
  cancel.style.display='inline-block';ok.textContent='Confirmar';ok.className='btn danger';
  document.getElementById('modal').classList.add('show');
}
function viewNote(i){
  const m=state.months[i];
  document.getElementById('modal-title').textContent='Observação — '+mLabel(m.date,true);
  document.getElementById('modal-text').textContent=m.obs||'';
  const cancel=document.getElementById('modal-cancel'),ok=document.getElementById('modal-ok');
  cancel.style.display='none';ok.textContent='Fechar';ok.className='btn ghost';
  modalCb=null;
  document.getElementById('modal').classList.add('show');
}
window.viewNote=viewNote;
document.getElementById('modal-cancel').addEventListener('click',()=>document.getElementById('modal').classList.remove('show'));
document.getElementById('modal-ok').addEventListener('click',()=>{document.getElementById('modal').classList.remove('show');if(modalCb)modalCb();});
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')document.getElementById('modal').classList.remove('show');});
let toastT;function toast(msg,err){const t=document.getElementById('toast');t.textContent=msg;t.className='show'+(err?' err':'');clearTimeout(toastT);toastT=setTimeout(()=>t.className='',2600);}

/* ============ Render all ============ */
function renderAll(){renderPainel();renderHistorico();renderAtivos();renderRelatorio();
  const st=document.getElementById('storage-status');
  st.innerHTML = hasStorage
    ? '☁️ Tudo salvo na nuvem automaticamente. Abre em qualquer aparelho com o mesmo login.'
    : '⚠️ Não foi possível salvar na nuvem agora (sem internet?). Suas alterações mais recentes podem não ter sido sincronizadas — use <b>Salvar backup</b> por segurança.';
}
window.addEventListener('resize',()=>{clearTimeout(window._rz);window._rz=setTimeout(()=>{if(document.getElementById('v-painel').classList.contains('active'))renderPainel();if(document.getElementById('v-relatorio').classList.contains('active'))renderRelatorio();},200);});

/* ============ Firebase: login e inicialização ============ */
const loginOverlay=document.getElementById('login-overlay');
const loginErr=document.getElementById('login-err');
const loginNote=document.getElementById('login-note');
let appStarted=false;

function friendlyAuthError(code){
  const m={
    'auth/invalid-email':'E-mail inválido.',
    'auth/user-not-found':'E-mail ou senha incorretos.',
    'auth/wrong-password':'E-mail ou senha incorretos.',
    'auth/invalid-credential':'E-mail ou senha incorretos.',
    'auth/too-many-requests':'Muitas tentativas. Espere um pouco e tente de novo.',
    'auth/network-request-failed':'Sem conexão com a internet.'
  };
  return m[code]||'Não foi possível entrar. Tente novamente.';
}

function doLogin(){
  loginErr.textContent='';
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  if(!email||!pass){loginErr.textContent='Preencha e-mail e senha.';return;}
  const btn=document.getElementById('login-btn');btn.disabled=true;btn.textContent='Entrando...';
  auth.signInWithEmailAndPassword(email,pass)
    .catch(err=>{loginErr.textContent=friendlyAuthError(err.code);})
    .finally(()=>{btn.disabled=false;btn.textContent='Entrar';});
}

function startApp(){
  if(appStarted)return; appStarted=true;
  loginOverlay.classList.add('hidden');
  (async()=>{ await load(); renderAll(); })();
}

// Auto-refetch quando a janela volta ao foco (ex: abriu no trabalho depois de mexer em casa)
let refetchT;
window.addEventListener('focus',()=>{
  if(!appStarted||!auth||!auth.currentUser)return;
  if(document.getElementById('v-lancar').classList.contains('active'))return; // não atrapalha digitação
  clearTimeout(refetchT);refetchT=setTimeout(async()=>{await load();renderAll();},400);
});

document.getElementById('login-btn').addEventListener('click',doLogin);
document.getElementById('login-pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
document.getElementById('login-email').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});

if(FIREBASE_CONFIG.apiKey==='COLE_AQUI'){
  loginNote.innerHTML='⚙️ Este app ainda não foi configurado. Siga o guia de instalação para colar os dados do Firebase.';
  document.getElementById('login-btn').disabled=true;
}else{
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    auth=firebase.auth();
    db=firebase.firestore();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    auth.onAuthStateChanged(user=>{ if(user)startApp(); else loginOverlay.classList.remove('hidden'); });
  }catch(e){
    loginNote.textContent='Erro ao iniciar o Firebase. Confira se a configuração foi colada corretamente.';
    console.error(e);
  }
}