'use strict';
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const K=['kcal','p','c','f'],LBL={kcal:'Calories',p:'Protein',c:'Carbohydrates',f:'Fat'},U={kcal:'kcal',p:'g',c:'g',f:'g'};
const MEALS=['Breakfast','Lunch','Dinner','Snacks'];
const fmt=(n,d=0)=>(Math.round((+n||0)*10**d)/10**d).toLocaleString('en-GB',{maximumFractionDigits:d});
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const today=()=>iso(new Date());
const addDays=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)};
const guessMeal=()=>{const h=new Date().getHours();return h<11?'Breakfast':h<16?'Lunch':h<21?'Dinner':'Snacks'};
// [name, kcal, protein, carbs, fat per 100g, density g/ml (optional)] - typical approximate values; check against packaging
const SEED=[['Chicken breast (raw)',106,23,0,1.3],['Chicken breast (cooked)',150,32,0,2.5],['Basmati rice (dry)',350,8.5,77,.8],['Basmati rice (cooked)',130,3,28,.3],
['Pasta (dry)',355,12,72,1.5],['Pasta (cooked)',150,5.5,30,1],['Porridge oats',372,11,60,8],['White bread',235,8.5,43,2.3],['Plain flour',340,10,75,1.3],
['Potato (raw)',75,2,17,.1],['Sweet potato (raw)',86,1.6,20,.1],['Onion (raw)',40,1.1,9,.1],['Carrot (raw)',36,.6,8,.3],['Broccoli (raw)',34,2.8,6.6,.4],
['Spinach (raw)',23,2.9,1.4,.4],['Tomato (raw)',18,.9,3.9,.2],['Mushrooms (raw)',22,3,.4,.5],['Pepper (raw)',31,1,6,.3],['Banana',95,1.1,23,.3],['Apple',52,.3,14,.2],
['Beef mince 5% fat (raw)',125,21,0,5],['Beef mince 12% fat (raw)',175,19,0,12],['Salmon fillet (raw)',200,20,0,13],['Cod fillet (raw)',80,18,0,.7],['Tuna in water (tinned)',110,25,0,1],
['Egg (whole, raw)',143,12.6,.7,9.5],['Whole milk',64,3.4,4.7,3.6,1.03],['Semi-skimmed milk',47,3.5,4.8,1.7,1.03],['Greek yoghurt (5% fat)',97,9,4,5,1.03],
['Cheddar cheese',416,25,.1,35],['Butter',717,.5,.5,81,.91],['Olive oil',900,0,0,100,.91],['Rapeseed oil',900,0,0,100,.92],['Peanut butter',600,25,12,50,1.1],
['Sugar (white)',400,0,100,0],['Honey',305,.4,76,0,1.4],['Red lentils (dry)',330,24,50,1.5],['Chickpeas (tinned)',120,7,16,2.5]];
const defGoal={from:'1970-01-01',kcal:2000,p:150,c:200,f:65,type:'Custom'};
const defRules={kcal:{mode:'tol',tol:100},p:{mode:'min',tol:0},c:{mode:'tol',tol:20},f:{mode:'tol',tol:10}};
const defState=()=>({v:2,entries:[],ingredients:SEED.map((s,i)=>({id:'s'+i,name:s[0],kcal:s[1],p:s[2],c:s[3],f:s[4],d:s[5]||0,src:'approx'})),
 recipes:[],saved:[],recent:[],goals:[{...defGoal}],goalsSet:false,complete:{},rules:JSON.parse(JSON.stringify(defRules)),settings:{theme:'auto'},lastBackup:null});
const migrate=s=>{const d=defState();for(const k in d)if(s[k]===undefined)s[k]=d[k];s.saved.forEach(m=>{if(m.portion==null)m.portion=1;if(m.count==null)m.count=0;if(m.meal==null)m.meal='';if(m.ing==null)m.ing='';if(m.last==null)m.last=0});s.v=2;return s};
let S,ui={tab:'today',date:today(),add:'quick',q:'',rq:'',sq:'',iq:'',draft:null,set:null,range:'7',from:'',to:'',metric:'kcal',saveTab:'all',addMeal:guessMeal(),off:[],offMsg:'',parsed:null,recipeEdit:false};
// ---------- storage (IndexedDB) ----------
let _db;const DB={open(){return _db||(_db=new Promise((res,rej)=>{const r=indexedDB.open('macro-tracker-new',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}))},
 async get(k){const db=await this.open();return new Promise((res,rej)=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})},
 async set(k,v){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error)})}};
let _st;const save=()=>{clearTimeout(_st);_st=setTimeout(flush,120)};
const flush=()=>{clearTimeout(_st);return DB.set('state',S).catch(()=>toast('Could not save - browser storage may be blocked'))};
let _tt;const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(_tt);_tt=setTimeout(()=>t.classList.remove('on'),2200)};
// ---------- calculations ----------
const goalFor=d=>{let g=S.goals[0];for(const x of S.goals)if(x.from<=d)g=x;return g};
const dayEntries=d=>S.entries.filter(e=>e.date===d);
const sum=(arr,f)=>arr.reduce((a,x)=>a+f(x),0);
const dayTot=d=>{const es=dayEntries(d);return K.reduce((o,k)=>(o[k]=sum(es,e=>e[k]),o),{})};
const grams=it=>it.unit==='g'?it.q:it.unit==='ml'?it.q*it.d:it.unit==='tsp'?it.q*5*it.d:it.q*15*it.d;
const itemNut=(it,k)=>it.n[k]*grams(it)/100;
const draftTot=dr=>K.reduce((o,k)=>(o[k]=sum(dr.items,it=>itemNut(it,k)),o),{});
const meets=(k,t,g)=>{const r=S.rules[k];return r.mode==='min'?t>=g-1e-9:Math.abs(t-g)<=r.tol+1e-9};
const rangeDays=()=>{let from,to;if(ui.range==='custom'){from=ui.from||addDays(today(),-6);to=ui.to||today()}else{to=today();from=addDays(to,-(+ui.range-1))}
 const days=[];for(let d=from;d<=to&&days.length<366;d=addDays(d,1))days.push(d);return days};
const stats=days=>{const comp=days.filter(d=>S.complete[d]),o={n:comp.length,avg:{},diff:{},meet:{}};
 K.forEach(k=>{let s=0,df=0,m=0;comp.forEach(d=>{const t=dayTot(d)[k],g=goalFor(d)[k];s+=t;df+=t-g;if(meets(k,t,g))m++});o.avg[k]=comp.length?s/comp.length:null;o.diff[k]=comp.length?df/comp.length:null;o.meet[k]=m});return o};
// ---------- html helpers ----------
const bar=p=>`<div class="bar"><i class="${p>100?'over':''}" style="width:${Math.min(100,Math.max(0,p))}%"></i></div>`;
const badge=s=>`<span class="b ${s||'manual'}">${{verified:'Verified',approx:'Approximate',manual:'Manual'}[s]||'Manual'}</span>`;
const macroLine=n=>`${fmt(n.p,1)}g P · ${fmt(n.c,1)}g C · ${fmt(n.f,1)}g F`;
const per100=i=>`${fmt(i.kcal)} kcal · ${fmt(i.p,1)}P ${fmt(i.c,1)}C ${fmt(i.f,1)}F per 100g`+(i.d?` (${fmt(i.kcal*i.d)} kcal per 100ml)`:'');
const mealOpts=sel=>MEALS.map(m=>`<option ${m===sel?'selected':''}>${m}</option>`).join('');
const seg=(items,cur,act,key)=>`<div class="seg">${items.map(([v,l])=>`<button class="${v===cur?'on':''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
function nutForm(o,form,btn,extra=''){const q=form==='quick',m=o.miss||[],sh=k=>{const v=o[k];return v==null?'':(v===0&&!o.paste?'':v)};
 return `<form data-form="${form}" ${o.id?`data-id="${o.id}"`:''} ${m.length?`data-miss="${m.join(',')}"`:''} autocomplete="off">
 ${q&&!o.paste?'<button type="button" class="btn" data-act="spaste">📋 Smart Paste</button>':''}
 <input name="name" ${q?'data-in="nsearch"':''} placeholder="Food or meal name (optional)" value="${esc(o.name||'')}">${q?'<div class="sug"></div>':''}
 ${o.note||''}<div class="grid2">${K.map(k=>`<label>${LBL[k]} (${U[k]})<input class="${m.includes(k)?'miss':''}" name="${k}" type="number" inputmode="decimal" step="any" min="0" placeholder="0" value="${sh(k)}"></label>`).join('')}</div>
 ${o.meal?`<div class="grid2"><label>Meal<select name="meal">${mealOpts(o.meal)}</select></label><label>Date<input name="date" type="date" value="${o.date}"></label></div>`:''}
 ${q?'<label><input type="checkbox" name="savemeal" style="width:auto"> Also save to My Meals</label>':''}
 <button class="btn pri" style="padding:16px;font-size:18px">${btn}</button></form>${extra}`}
function openSheet(h){$('#panel').innerHTML=h;$('#sheet').hidden=false}
const closeSheet=()=>{$('#sheet').hidden=true};
// ---------- views ----------
function vToday(){
 const d=ui.date,g=goalFor(d),t=dayTot(d),rem=g.kcal-t.kcal,pct=g.kcal?t.kcal/g.kcal*100:0;
 const lbl=new Date(d+'T12:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
 const mc=m=>{const es=dayEntries(d).filter(e=>e.meal===m);return `<div class="card"><div class="mh"><span>${m} · ${fmt(sum(es,e=>e.kcal))} kcal</span><button data-act="quick" data-meal="${m}">+ Add</button></div>
  ${es.map(e=>`<div class="row" data-act="edit" data-id="${e.id}"><div><b>${esc(e.name)}</b><small>${macroLine(e)}</small></div><div class="kc">${fmt(e.kcal)}</div></div>`).join('')||'<small>Nothing logged</small>'}</div>`};
 const mr=k=>{const p=g[k]?t[k]/g[k]*100:0,r=g[k]-t[k];return `<div class="mrow"><div class="l"><b>${LBL[k]}</b><span>${fmt(t[k],1)} / ${fmt(g[k])} g</span></div>${bar(p)}<small class="${r<0?'over':''}">${r>=0?fmt(r,1)+' g remaining':fmt(-r,1)+' g over target'} · ${fmt(p)}%</small></div>`};
 return `<div class="datebar"><button data-act="day" data-n="-1">‹</button><div><b>${d===today()?'Today':''}</b><div>${lbl}</div>${d!==today()?'<small data-act="jump" style="color:var(--ac)">Jump to today</small>':''}</div><button data-act="day" data-n="1">›</button></div>
 <div class="card hero"><div class="big">${fmt(t.kcal)}</div><div class="sub">of ${fmt(g.kcal)} kcal · ${fmt(pct)}%</div>${bar(pct)}<div class="sub ${rem<0?'over':''}"><b>${rem>=0?fmt(rem)+' kcal remaining':fmt(-rem)+' kcal over target'}</b></div></div>
 <div class="card">${['p','c','f'].map(mr).join('')}</div>
 <div class="btns" style="margin-bottom:12px;flex-wrap:nowrap"><button class="quick" style="flex:3;margin:0;width:auto;min-width:0" data-act="quick">+ Quick Add</button><button class="quick sv" style="flex:2;margin:0;width:auto;min-width:0;font-size:17px" data-act="gosaved">⭐ Saved Meals</button></div>${MEALS.map(mc).join('')}
 <button class="btn ${S.complete[d]?'pri':''}" data-act="complete">${S.complete[d]?'✓ Day marked complete (tap to undo)':'Mark day as complete'}</button>`}
function vAdd(){
 const tabs=seg([['quick','Quick'],['ingr','Ingredients'],['text','Type'],['saved',`⭐ Saved Meals (${S.saved.length})`]],ui.add,'addtab');
 if(ui.add==='quick')return tabs+`<div class="card"><h3>Quick Add</h3>${nutForm({meal:guessMeal(),date:ui.date},'quick','Save')}</div>`;
 if(ui.add==='ingr')return tabs+vBuild('add');
 if(ui.add==='text')return tabs+vText();
 return tabs+vSaved()}
function vSaved(){
 return `<div class="card"><div class="mh"><span>Saved Meals (${S.saved.length})</span><button class="pri" data-act="newmeal">+ New meal</button></div>
 <input data-in="sq" type="search" placeholder="Search my meals and past meals…" value="${esc(ui.sq)}">
 ${seg([['all','All'],['fav','★ Favourites'],['recent','Recent'],['freq','Frequent'],['eaten','Eaten']],ui.saveTab,'savetab')}<div id="slist">${savedList()}</div></div>
 <div class="card"><h3>Copy from a previous day</h3><form data-form="copyday"><div class="grid2"><label>From date<input name="from" type="date" value="${addDays(ui.date,-1)}"></label><label>Meal<select name="meal"><option value="all">All meals</option>${mealOpts('')}</select></label></div><button class="btn">Copy to ${ui.date}</button></form></div>`}
function savedList(){
 const q=ui.sq.trim().toLowerCase();ui.pool=[];const pr=r=>{ui.pool.push(r);return recentRow(r,ui.pool.length-1)};
 if(q)return rankMeals(q).map(x=>x.src==='s'?savedRow(x.m):pr(x.m)).join('')||'<small>No matches</small>';
 if(ui.saveTab==='eaten')return recents().map(pr).join('')||'<small>Nothing logged yet.</small>';
 let l=[...S.saved];
 if(ui.saveTab==='fav')l=l.filter(s=>s.fav).sort(byName);
 else if(ui.saveTab==='freq')l=l.filter(s=>s.count>0).sort((a,b)=>b.count-a.count||byName(a,b)).slice(0,20);
 else if(ui.saveTab==='recent')l=l.filter(s=>s.last).sort((a,b)=>b.last-a.last).slice(0,20);
 else l.sort((a,b)=>(!!b.fav)-(!!a.fav)||byName(a,b));
 return l.map(savedRow).join('')||(ui.saveTab==='all'?'<small>No saved meals yet. Use “+ New meal”, or “Save to My Meals” on a diary entry.</small>':`<small>Nothing in this tab yet. ${S.saved.length?`You have ${S.saved.length} saved meal(s) – tap <b>All</b> to see them.`:''}</small>`)}
function resHTML(){
 const q=ui.q.trim().toLowerCase();let l;
 if(!q)l=S.recent.map(id=>S.ingredients.find(i=>i.id===id)).filter(Boolean);else{const w=q.split(/\s+/);l=S.ingredients.filter(i=>w.every(x=>i.name.toLowerCase().includes(x))).slice(0,15)}
 let h=(!q&&l.length?'<small>Recently used</small>':'')+l.map(i=>`<div class="row" data-act="pick" data-id="${i.id}"><div><b>${esc(i.name)}</b><small>${per100(i)}</small></div>${badge(i.src)}</div>`).join('');
 if(q){h+=`<div class="row" data-act="offsearch"><div><b>🌐 Search Open Food Facts</b><small>Needs internet · results are approximate</small></div></div>`;
  h+=ui.off.map((o,i)=>`<div class="row" data-act="offuse" data-i="${i}"><div><b>${esc(o.name)}</b><small>${per100(o)}</small></div>${badge('approx')}</div>`).join('');
  if(ui.offMsg)h+=`<small>${esc(ui.offMsg)}</small>`;
  h+=`<div class="row" data-act="newing" data-name="${esc(ui.q)}"><b>+ Create custom ingredient “${esc(ui.q)}”</b></div>`}
 return h}
const unitsFor=it=>it.d?['g','ml','tsp','tbsp']:['g'];
const itemsHTML=()=>{const dr=ui.draft;return dr.items.map((it,i)=>`<div class="item"><div><b>${esc(it.name)}</b> ${badge(it.src)}</div><div class="qty"><input data-in="qty" data-i="${i}" type="number" inputmode="decimal" step="any" min="0" value="${it.q}"><select data-in="unit" data-i="${i}">${unitsFor(it).map(u=>`<option ${u===it.unit?'selected':''}>${u}</option>`).join('')}</select><span id="ik${i}">${fmt(itemNut(it,'kcal'))} kcal</span><button data-act="rmi" data-i="${i}">✕</button></div></div>`).join('')||'<small>Search above and tap an ingredient to add it. Quantities in g, or ml/tsp/tbsp where a conversion is known.</small>'};
function totalsHTML(mode){const dr=ui.draft,t=draftTot(dr),pn=Number(dr.portions);
 let h=`<div class="mh"><span>${mode==='recipe'?'Full recipe':'Total'}</span><span>${fmt(t.kcal)} kcal</span></div><small>${macroLine(t)}</small>`;
 if(mode==='recipe'){if(pn>0){const p=K.reduce((o,k)=>(o[k]=t[k]/pn,o),{});h+=`<div class="mh" style="margin-top:10px"><span>Per portion (${fmt(pn,2)})</span><span>${fmt(p.kcal)} kcal</span></div><small>${macroLine(p)}</small>`}else h+='<small class="over">Portions must be greater than 0</small>'}
 return h}
function vBuild(mode){
 const dr=ui.draft||(ui.draft={name:'',portions:1,items:[]});
 return `<div class="card"><input data-in="dname" placeholder="${mode==='recipe'?'Recipe name':'Meal name (optional)'}" value="${esc(dr.name)}">
 ${mode==='recipe'?`<label>Number of portions<input data-in="dportions" type="number" inputmode="decimal" step="any" min="1" value="${dr.portions}"></label>`:''}</div>
 <div class="card"><input data-in="q" placeholder="Search ingredients…" value="${esc(ui.q)}"><div id="res">${resHTML()}</div></div>
 <div class="card" id="items">${itemsHTML()}</div><div class="card" id="totals">${totalsHTML(mode)}</div>
 ${mode==='recipe'?`<button class="btn pri" data-act="rsave">Save recipe</button>`:`<div class="card"><label>Meal<select id="bm">${mealOpts(ui.addMeal)}</select></label><div class="btns"><button class="pri" data-act="badd">Add to diary</button><button data-act="bmeal">Save as meal</button><button data-act="brecipe">Make recipe</button></div></div>`}
 ${dr.items.length||dr.name?`<button class="btn dng" data-act="bclear">Clear</button>`:''}`}
function vText(){
 const p=ui.parsed;
 let h=`<div class="card"><label>Type ingredients, e.g. “200g chicken breast, 100g dry rice, 10g olive oil”</label><textarea id="tx" rows="3">${esc(ui.txt||'')}</textarea><button class="btn pri" data-act="parse">Match ingredients</button></div>`;
 if(p){h+='<div class="card">'+p.map((x,i)=>{
  if(x.err)return `<div class="item"><b>${esc(x.raw)}</b><small class="over">${esc(x.err)}</small></div>`;
  if(!x.cands.length)return `<div class="item"><b>${esc(x.raw)}</b><small class="over">No matching ingredient. Create it in Add → Ingredients, then try again.</small></div>`;
  return `<div class="item"><b>${fmt(x.q,2)} ${x.unit} — ${esc(x.query)}</b><select data-in="pchoice" data-i="${i}"><option value="">Choose a match…</option>${x.cands.map(c=>`<option value="${c.id}" ${x.pick===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`}).join('')
  +`<button class="btn pri" data-act="parseadd">Add matched items to ingredient list</button><small>Unmatched or unchosen lines are skipped, never guessed.</small></div>`}
 return h}
function vRecipes(){
 if(ui.recipeEdit)return `<div class="top"><button data-act="rcancel">‹ Back</button><h2>${ui.draft.id?'Edit':'New'} recipe</h2></div>`+vBuild('recipe');
 return `<h2>My Recipes</h2><button class="btn pri" data-act="rnew">+ New recipe</button><input data-in="rq" placeholder="Search recipes…" value="${esc(ui.rq)}"><div id="rlist">${recipeList()}</div>`}
function recipeList(){const q=ui.rq.toLowerCase();
 return S.recipes.filter(r=>r.name.toLowerCase().includes(q)).sort((a,b)=>(!!b.fav)-(!!a.fav)||a.name.localeCompare(b.name)).map(r=>{const t=draftTot(r),n=r.portions,p=K.reduce((o,k)=>(o[k]=t[k]/n,o),{});
  return `<div class="card"><div class="mh"><span>${r.fav?'★ ':''}${esc(r.name)}</span><span>${fmt(p.kcal)} kcal/portion</span></div><small>${fmt(n,2)} portions · per portion ${macroLine(p)}</small><small>Whole recipe: ${fmt(t.kcal)} kcal · ${macroLine(t)}</small><small>${r.items.map(i=>`${fmt(i.q,1)}${i.unit} ${esc(i.name)}`).join(', ')}</small>
  <div class="btns" style="margin-top:8px"><button class="pri" data-act="radd" data-id="${r.id}">Add</button><button data-act="redit" data-id="${r.id}">Edit</button><button data-act="rdup" data-id="${r.id}">Copy</button><button data-act="rfav" data-id="${r.id}">★</button><button data-act="rdel" data-id="${r.id}">🗑</button></div></div>`}).join('')||'<small>No recipes yet.</small>'}
function chart(days,k){
 const W=340,H=170,pl=34,pb=18,pt=8,pr=4,has=d=>S.entries.some(e=>e.date===d);
 const max=Math.max(1,...days.map(d=>has(d)?dayTot(d)[k]:0),...days.map(d=>goalFor(d)[k]))*1.1,bw=(W-pl-pr)/days.length,y=v=>pt+(H-pt-pb)*(1-v/max);
 let s=`<svg viewBox="0 0 ${W} ${H}" class="chart">`;
 [0,.5,1].forEach(f=>{const v=max/1.1*f;s+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl-4}" y="${y(v)+3}" text-anchor="end">${fmt(v)}</text>`});
 days.forEach((d,i)=>{const x=pl+i*bw;if(has(d)){const v=dayTot(d)[k];s+=`<rect x="${x+bw*.15}" y="${y(v)}" width="${bw*.7}" height="${H-pb-y(v)}" rx="2" class="bar1 ${S.complete[d]?'':'inc'}"/>`}
  const gy=y(goalFor(d)[k]);s+=`<line x1="${x}" x2="${x+bw}" y1="${gy}" y2="${gy}" class="tgt"/>`});
 s+=`<text x="${pl}" y="${H-4}">${days[0].slice(5)}</text><text x="${W-pr}" y="${H-4}" text-anchor="end">${days[days.length-1].slice(5)}</text></svg>`;return s}
function vProgress(){
 const days=rangeDays(),st=stats(days),dt=(k,v)=>v===null?'–':(v>=0?'+':'−')+fmt(Math.abs(v),k==='kcal'?0:1)+' '+U[k];
 const rank=K.filter(k=>st.n).sort((a,b)=>st.meet[b]-st.meet[a]);
 const cur=stats(Array.from({length:7},(_,i)=>addDays(today(),-i))),prev=stats(Array.from({length:7},(_,i)=>addDays(today(),-7-i)));
 const chg=k=>{if(cur.avg[k]===null||prev.avg[k]===null)return 'n/a';const d=cur.avg[k]-prev.avg[k];return Math.abs(d)<.05?'no change':`${fmt(Math.abs(d),k==='kcal'?0:1)} ${U[k]} ${d>0?'increase':'decrease'}`};
 return `<h2>Progress</h2>${seg([['7','7 days'],['30','30 days'],['custom','Custom']],ui.range,'range')}
 ${ui.range==='custom'?`<div class="grid2"><input type="date" data-in="from" value="${ui.from||days[0]}"><input type="date" data-in="to" value="${ui.to||days[days.length-1]}"></div>`:''}
 <div class="card"><b>${st.n} of ${days.length} days marked complete</b><small>Only completed days are used. Unlogged days are never counted as zero.</small>
 <table><tr><th></th><th>Average</th><th>vs target</th><th>Goal met</th></tr>${K.map(k=>`<tr><td><b>${LBL[k].slice(0,7)}</b></td><td>${st.avg[k]===null?'–':fmt(st.avg[k],k==='kcal'?0:1)}</td><td>${dt(k,st.diff[k])}</td><td>${st.n?`${st.meet[k]}/${st.n} (${fmt(st.meet[k]/st.n*100)}%)`:'–'}</td></tr>`).join('')}</table>
 ${st.n?`<small>Most consistently met: ${LBL[rank[0]]} · Least: ${LBL[rank[rank.length-1]]}</small>`:''}</div>
 <div class="card">${seg(K.map(k=>[k,LBL[k].slice(0,5)]),ui.metric,'metric')}${chart(days,ui.metric)}<small>Bars: intake (faded = day not marked complete). Red line: target on that day.</small></div>
 <div class="card"><b>Last 7 days vs previous 7 days</b><table><tr><th></th><th>Now</th><th>Before</th><th>Change</th></tr>${K.map(k=>`<tr><td><b>${LBL[k].slice(0,7)}</b></td><td>${cur.avg[k]===null?'–':fmt(cur.avg[k],k==='kcal'?0:1)}</td><td>${prev.avg[k]===null?'–':fmt(prev.avg[k],k==='kcal'?0:1)}</td><td>${chg(k)}</td></tr>`).join('')}</table>
 ${cur.n?K.map(k=>`<small>${LBL[k]} target met on ${cur.meet[k]} of ${cur.n} completed days · average ${dt(k,cur.diff[k])} vs target</small>`).join(''):'<small>No completed days in the last 7 days.</small>'}</div>`}
function vSettings(){
 if(ui.set==='ingr')return `<div class="top"><button data-act="setback">‹ Back</button><h2>Ingredients</h2></div><button class="btn pri" data-act="newing">+ New ingredient</button><input data-in="iq" placeholder="Search…" value="${esc(ui.iq)}"><div class="card" id="ilist">${ingList()}</div>`;
 const g=goalFor(today());
 return `<h2>Settings</h2><div class="card"><h3>My Goals</h3><form data-form="goals"><div class="grid2">${K.map(k=>`<label>${LBL[k]} (${U[k]})<input name="${k}" type="number" inputmode="decimal" step="any" min="0" value="${g[k]}"></label>`).join('')}</div>
 <div class="grid2"><label>Goal type (label only)<select name="type">${['Maintain weight','Lose weight','Gain weight','Custom'].map(t=>`<option ${t===g.type?'selected':''}>${t}</option>`).join('')}</select></label><label>Applies from<input name="from" type="date" value="${today()}"></label></div>
 <button class="btn pri">Save goals</button></form><small>Past days are always compared with the targets that applied on that date.</small>
 <b>Goal history</b>${[...S.goals].reverse().map(x=>`<small>${x.from==='1970-01-01'?'Earliest':x.from}: ${fmt(x.kcal)} kcal · ${fmt(x.p)}P ${fmt(x.c)}C ${fmt(x.f)}F · ${esc(x.type)}</small>`).join('')}</div>
 <div class="card"><h3>Goal achievement rules</h3><form data-form="rules">${K.map(k=>`<div class="grid2"><label>${LBL[k]}<select name="${k}_m"><option value="tol" ${S.rules[k].mode==='tol'?'selected':''}>Target ± tolerance</option><option value="min" ${S.rules[k].mode==='min'?'selected':''}>Minimum target</option></select></label><label>Tolerance (${U[k]})<input name="${k}_t" type="number" inputmode="decimal" step="any" min="0" value="${S.rules[k].tol}"></label></div>`).join('')}<button class="btn">Save rules</button></form></div>
 <div class="card"><button class="btn" data-act="mging">Manage ingredients (${S.ingredients.length})</button></div>
 <div class="card"><h3>Appearance</h3><select data-in="theme">${[['auto','Match iPhone'],['light','Light'],['dark','Dark']].map(([v,l])=>`<option value="${v}" ${S.settings.theme===v?'selected':''}>${l}</option>`).join('')}</select></div>
 <div class="card"><h3>Backup &amp; restore</h3><small>Your data lives only in this browser on this device. It does not sync between devices, and Safari can clear it (e.g. if you clear website data). Export a backup regularly.</small><small>Last backup: ${S.lastBackup?new Date(S.lastBackup).toLocaleString('en-GB'):'never'}</small>
 <button class="btn pri" data-act="export">Export backup (JSON)</button><label class="btn" style="display:block;text-align:center;background:var(--in);border-radius:12px;padding:12px;color:var(--tx)">Restore from backup<input type="file" id="imp" accept=".json,application/json" hidden></label><button class="btn" data-act="persist">Ask Safari to protect my data</button></div>`}
const ingList=()=>{const q=ui.iq.toLowerCase();return S.ingredients.filter(i=>i.name.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<div class="row" data-act="editing" data-id="${i.id}"><div><b>${esc(i.name)}</b><small>${per100(i)}</small></div>${badge(i.src)}</div>`).join('')||'<small>None</small>'};
function ingForm(i){return `<h3>${i.id?'Edit':'New'} ingredient</h3><form data-form="ingr" ${i.id?`data-id="${i.id}"`:''}><input name="name" placeholder="Name (e.g. Chicken breast (raw))" value="${esc(i.name||'')}" required>
 <small>Values per 100g</small><div class="grid2">${K.map(k=>`<label>${LBL[k]} (${U[k]})<input name="${k}" type="number" inputmode="decimal" step="any" min="0" placeholder="0" value="${i[k]||''}"></label>`).join('')}</div>
 <label>Density in g per ml (optional – enables ml, tsp, tbsp; e.g. oil 0.91)<input name="d" type="number" inputmode="decimal" step="any" min="0" value="${i.d||''}"></label>
 <label>Value source<select name="src">${[['manual','Manually entered'],['approx','Approximate'],['verified','Verified against packaging']].map(([v,l])=>`<option value="${v}" ${(i.src||'manual')===v?'selected':''}>${l}</option>`).join('')}</select></label>
 <button class="btn pri">Save</button></form>${i.id?`<button class="btn dng" data-act="deling" data-id="${i.id}">Delete ingredient</button><small>Recipes and diary entries keep their own copy of values.</small>`:''}`}
function render(){
 const y=scrollY;document.documentElement.dataset.theme=S.settings.theme;
 $('#view').innerHTML={today:vToday,add:vAdd,recipes:vRecipes,progress:vProgress,settings:vSettings}[ui.tab]();
 document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===ui.tab));scrollTo(0,y)}
const updTotals=()=>{const t=$('#totals');if(!t)return;t.innerHTML=totalsHTML(ui.tab==='recipes'?'recipe':'add');ui.draft.items.forEach((it,i)=>{const s=$('#ik'+i);if(s)s.textContent=fmt(itemNut(it,'kcal'))+' kcal'})};
const readNut=f=>{const o={};for(const k of K){const v=f[k].value.trim(),n=v===''?0:Number(v);if(!isFinite(n)||n<0){toast(LBL[k]+' must be 0 or more');return null}o[k]=n}return o};
const goToday=d=>{ui.date=d;ui.tab='today';closeSheet();render();scrollTo(0,0)};
const addEntry=(date,meal,name,n,sid)=>{S.entries.push({id:uid(),date,meal,name:name||'Quick add',kcal:n.kcal,p:n.p,c:n.c,f:n.f,at:Date.now(),...(sid?{sid}:{})});save()};
const findE=id=>S.entries.find(e=>e.id===id);
const bumpRecent=id=>{S.recent=[id,...S.recent.filter(x=>x!==id)].slice(0,10)};
// ---------- actions ----------
const keyOf=e=>[e.name,e.kcal,e.p,e.c,e.f].join('|');
const sameMeal=(a,b)=>a.name===b.name&&K.every(k=>a[k]===b[k]);
const byName=(a,b)=>a.name.localeCompare(b.name);
function recents(){const seen=new Set(),out=[];[...S.entries].sort((a,b)=>(b.at||0)-(a.at||0)||b.date.localeCompare(a.date)).forEach(e=>{const k=keyOf(e);if(!seen.has(k)&&out.length<30){seen.add(k);out.push({name:e.name,kcal:e.kcal,p:e.p,c:e.c,f:e.f,meal:e.meal})}});return out}
function rankMeals(q){const freq={};S.entries.forEach(e=>{const k=keyOf(e);freq[k]=(freq[k]||0)+1});const keys=new Set(S.saved.map(keyOf));
 const all=[...S.saved.map(s=>({src:'s',m:s,rk:0})),...recents().filter(r=>!keys.has(keyOf(r))).map((r,i)=>({src:'r',m:r,rk:i}))];
 return all.filter(x=>x.m.name.toLowerCase().includes(q)).map(x=>{const n=x.m.name.toLowerCase();x.sc=(n===q?1000:n.startsWith(q)?100:0)+(x.m.fav?300:0)+Math.min(200,((x.m.count||0)+(freq[keyOf(x.m)]||0))*20)+(x.src==='s'?50:0)-x.rk;return x}).sort((a,b)=>b.sc-a.sc).slice(0,20)}
const savedRow=s=>`<div class="row"><div style="flex:1;min-width:0"><b>${s.fav?'★ ':''}${esc(s.name)}</b><small>${fmt(s.kcal)} kcal · ${macroLine(s)}</small></div><button class="pri" data-act="mealadd" data-id="${s.id}">Add</button><button data-act="savedmenu" data-id="${s.id}">⋯</button></div>`;
const recentRow=(r,i)=>`<div class="row"><div style="flex:1;min-width:0"><b>${esc(r.name)}</b><small>${fmt(r.kcal)} kcal · ${macroLine(r)}</small></div><button class="pri" data-act="mealadd" data-i="${i}">Add</button><button data-act="rsavemeal" data-i="${i}">☆</button></div>`;
function mealForm(s){s=s||{};return `<form data-form="saved" ${s.id?`data-id="${s.id}"`:''} autocomplete="off"><input name="name" placeholder="Meal name" value="${esc(s.name||'')}">
 <div class="grid2">${K.map(k=>`<label>${LBL[k]} (${U[k]})<input name="${k}" type="number" inputmode="decimal" step="any" min="0" placeholder="0" value="${s[k]||''}"></label>`).join('')}</div>
 <div class="grid2"><label>Default portion<input name="portion" type="number" inputmode="decimal" step="any" min="0" value="${s.portion||1}"></label><label>Default meal<select name="meal"><option value="">Ask me</option>${mealOpts(s.meal)}</select></label></div>
 <label>Ingredients (optional notes – does not change the calories)<textarea name="ing" rows="3">${esc(s.ing||'')}</textarea></label>
 <label><input type="checkbox" name="fav" ${s.fav?'checked':''} style="width:auto"> Favourite</label><button class="btn pri">Save</button></form>`}
function saveMealFrom(o,meal,ing=''){if(!o.name||o.name==='Quick add'){toast('Give it a name first');return false}if(S.saved.some(s=>sameMeal(s,o))){toast('Already in My Meals');return true}
 S.saved.push({id:uid(),name:o.name,kcal:o.kcal,p:o.p,c:o.c,f:o.f,fav:false,portion:1,meal:meal||'',ing,count:0,last:0});ui.saveTab='all';save();toast('Saved – find it under Saved Meals');return true}
function updPrev(){const el=$('#lprev'),i=$('#panel [name=n]');if(!el||!i||!ui.log)return;const n=Number(i.value),b=ui.log.b;
 el.innerHTML=i.value.trim()!==''&&n>0?`<b>${fmt(b.kcal*n)} kcal</b><small>${fmt(b.p*n,1)}g P · ${fmt(b.c*n,1)}g C · ${fmt(b.f*n,1)}g F</small>`:'<small class="over">Enter a portion above 0</small>'}
function logSheet(b,src){ui.log={b,src};
 openSheet(`<h3>${esc(b.name)}</h3><small>Per 1 portion: ${fmt(b.kcal)} kcal · ${macroLine(b)}</small><form data-form="log" autocomplete="off"><div class="seg" style="margin-top:10px">${[.5,1,1.5,2].map(v=>`<button type="button" data-act="chip" data-v="${v}">${v}</button>`).join('')}</div>
 <label>Portions<input name="n" data-in="lport" type="number" inputmode="decimal" step="any" min="0" value="${b.portion||1}"></label><div class="card" id="lprev" style="background:var(--in);margin:8px 0"></div>
 <div class="grid2"><label>Meal<select name="meal">${mealOpts(b.meal||guessMeal())}</select></label><label>Date<input name="date" type="date" value="${ui.date}"></label></div>
 <button class="btn pri" style="padding:16px;font-size:18px">Add to diary</button></form>${src==='r'?'<button class="btn" data-act="lsave">☆ Save to My Meals</button>':''}`);updPrev()}
// ---- Smart Paste: local deterministic parser ----
const NUM='(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const LAB={kcal:'(?:kcal|calories|cals?|energy)',p:'protein',c:'carb(?:ohydrate)?s?',f:'fats?'};
const BAD='(?!\\s*(?:powder|shakes?|bars?|free|yog\\w*|milk|mayo\\w*)\\b)';
const NOISE=/\b(here|estimated?|nutrition\w*|macros?|breakdown|approximately|approx|roughly|about|below|summary|values?|information|calculat\w*|ingredients?|total|based|sure|let|these|this|following|nutrient|amount|quantity|item|food|serving|portion|per|is|are|has|have|contains?|comes|provides?|gives?|with|which|totals?)\b/i;
const toNum=s=>parseFloat(s.replace(/,/g,''));
function findClaims(line){
 const V=[],L=[],S2=[];
 const run=(re,k,arr,st)=>{let m;while((m=re.exec(line))){const ni=m.index+m[0].indexOf(m[1]);arr.push({k,v:toNum(m[1]),ni,ne:ni+m[1].length,pos:m.index,end:m.index+m[0].length,st})}};
 for(const k of K){
  run(new RegExp(NUM+'\\s*'+(k==='kcal'?'(?:kcal|calories|cals?)\\b':'(?:g|grams?)?\\s*(?:of\\s+)?'+LAB[k]+'\\b'+BAD),'gi'),k,V,'V');
  run(new RegExp('\\b'+LAB[k]+'\\b[\\s:=|\\-–—~≈]*'+NUM,'gi'),k,L,'L')}
 let m;const sre=new RegExp('\\b([PCF])\\b\\s*[:=]\\s*'+NUM,'gi');
 while((m=sre.exec(line))){const ni=m.index+m[0].length-m[2].length;S2.push({k:m[1].toLowerCase(),v:toNum(m[2]),ni,ne:ni+m[2].length,pos:m.index,end:m.index+m[0].length,st:'S'})}
 const sat=c=>/(satur\w*|unsatur\w*|trans|mono\w*|poly\w*|which)\s+$/i.test(line.slice(Math.max(0,c.pos-14),c.pos));
 const all=[...V,...L.filter(c=>!sat(c)),...S2].filter(c=>isFinite(c.v)&&!/\d\s*[-–—]\s*$/.test(line.slice(0,c.ni))&&!/^\s*[-–—]\s*\d/.test(line.slice(c.ne)));
 const sc={V:V.length,L:L.length,S:S2.length},by={};all.forEach(c=>(by[c.ni]=by[c.ni]||[]).push(c));
 return Object.values(by).map(g=>{const w=g.sort((a,b)=>sc[b.st]-sc[a.st])[0];w.pos=Math.min(...g.filter(x=>x.k===w.k).map(x=>x.pos));return w}).sort((a,b)=>a.ni-b.ni)}
function ctxInfo(t,plain){
 t=t.replace(/[*_#`>|]/g,' ').replace(/^\s*(?:[-•]|\d+[.)])\s+/,'').replace(/\s+/g,' ').trim().replace(/[:\-–—,;(\s]+$/,'').trim();
 const m=t.match(/^(?:meal|dish|food|recipe|name|item)\s*[:\-–]\s*(.+)$/i),body=m?'':t;let scope='';
 if(/per\s+(?:portion|serving|person)|\beach\b|\b(?:1|one)\s+(?:portion|serving)|\bserving\b|\bportion\b/i.test(body))scope='Per portion';
 else if(/\b(?:whole|entire|full|batch|recipe)\b/i.test(body))scope='Whole recipe';else if(/\btotal\b/i.test(body))scope='Total';
 const cand=m?m[1].trim():(plain&&!scope?t:'');let name='';
 if(cand&&cand.length<=60&&cand.split(' ').length<=8&&!/\d/.test(cand)&&/[a-z]/i.test(cand)&&(m||!NOISE.test(cand))&&!/^(kcal|calories|cals?|energy|protein|carbs?|carbohydrates?|fats?)$/i.test(cand))name=cand;
 return{name,scope}}
function parsePaste(text){
 const sums=[];let cur=null,lastName='',pend='',pendE=false;
 const begin=ctx=>{const i=ctxInfo(ctx,true),j=ctxInfo(pend,pendE);cur={name:i.name||j.name||lastName,scope:i.scope||j.scope,kcal:null,p:null,c:null,f:null};sums.push(cur);pend='';pendE=false};
 for(const raw of String(text).replace(/\r/g,'').split('\n')){
  if(!raw.trim()||/^[\s|:\-–—=_*]+$/.test(raw))continue;
  const line=raw.replace(/[*_`]/g,'').replace(/^\s*(?:[-•]|#+)\s+/,''),cl=findClaims(line);
  if(!cl.length){const emph=/^\s*(?:#+\s|\*\*|__)/.test(raw),i=ctxInfo(line,emph);if(i.name)lastName=i.name;if(i.scope&&cur&&K.some(k=>cur[k]!==null))cur=null;pend=line;pendE=emph;continue}
  let prev=0;for(const c of cl){if(!cur||cur[c.k]!==null){let ctx=line.slice(prev,c.pos);if(!/[a-z]/i.test(ctx))ctx='';begin(ctx)}cur[c.k]=c.v;prev=c.end}}
 return sums.filter(s=>K.some(k=>s[k]!==null))}
function pasteView(i){const P=ui.paste;
 if(i===null)return `<h3>Which one?</h3><small>More than one summary was found. Choose the one to log.</small>`+P.sums.map((s,j)=>`<div class="card" style="background:var(--in);margin-top:10px"><b>${esc(s.scope||s.name||'Option '+(j+1))}${s.scope&&s.name?' · '+esc(s.name):''}</b><small>${s.kcal==null?'Calories missing':fmt(s.kcal)+' kcal'} · ${['p','c','f'].map(k=>(s[k]==null?'?':fmt(s[k],1))+k.toUpperCase()).join(' ')}</small><button class="btn pri" data-act="spuse" data-i="${j}">Use this</button></div>`).join('');
 const s=P.sums[i],miss=K.filter(k=>s[k]==null);
 return (P.sums.length>1?`<button class="btn" data-act="spback">‹ Other options</button>`:'')+`<h3>Review &amp; save</h3>`+nutForm({name:s.name,kcal:s.kcal,p:s.p,c:s.c,f:s.f,meal:P.meal||guessMeal(),date:P.date||ui.date,miss,paste:true,
  note:`<small>${s.scope?'Detected: '+s.scope+'. ':''}${miss.length?'Not found: '+miss.map(k=>LBL[k]).join(', ')+' (highlighted – blank saves as 0).':'All four values found – check them, then save.'}</small>`},'quick','Save')}
// ---- backup validation / merge ----
const validBackup=d=>{if(!d||typeof d!=='object')return 'Not a backup file';if(!Array.isArray(d.entries)||!Array.isArray(d.ingredients))return 'Missing diary or ingredient data';
 if(!d.entries.every(e=>e&&typeof e.date==='string'&&e.id!==undefined&&K.every(k=>Number.isFinite(e[k])&&e[k]>=0)))return 'Some diary entries are invalid';
 if(d.saved&&!(Array.isArray(d.saved)&&d.saved.every(m=>m&&m.id!==undefined&&typeof m.name==='string')))return 'Saved meals are invalid';return null};
function mergeData(cur,d){d=migrate(d);const un=(a,b)=>{const ids=new Set(a.map(x=>x.id));return[...a,...b.filter(x=>!ids.has(x.id))]};
 for(const k of['entries','ingredients','recipes','saved'])cur[k]=un(cur[k],d[k]||[]);
 const gf=new Set(cur.goals.map(g=>g.from));d.goals.forEach(g=>{if(!gf.has(g.from)&&g.from!=='1970-01-01')cur.goals.push(g)});cur.goals.sort((a,b)=>a.from.localeCompare(b.from));
 for(const k in d.complete)if(!(k in cur.complete))cur.complete[k]=d.complete[k];return cur}
const acts={
 gosaved(){ui.tab='add';ui.add='saved';ui.saveTab='all';ui.sq='';ui.set=null;ui.recipeEdit=false;render();scrollTo(0,0)},
 newmeal(){openSheet('<h3>New meal</h3>'+mealForm())},
 savedmenu(el){const s=S.saved.find(x=>x.id===el.dataset.id);openSheet(`<h3>Edit meal</h3><small>Changes apply to future logging only – past diary entries keep their values.</small>`+mealForm(s)+`<div class="btns" style="margin-top:10px"><button data-act="sdup" data-id="${s.id}">Duplicate</button><button class="dng" data-act="sdel" data-id="${s.id}">Delete</button></div>`)},
 mealadd(el){if(el.dataset.id)logSheet(S.saved.find(x=>x.id===el.dataset.id),'s');else logSheet(ui.pool[+el.dataset.i],'r')},
 chip(el){const i=$('#panel [name=n]');i.value=el.dataset.v;updPrev()},
 lsave(){saveMealFrom(ui.log.b,$('#panel [name=meal]').value)},rsavemeal(el){saveMealFrom(ui.pool[+el.dataset.i],'')},
 favE(el){const e=findE(el.dataset.id);if(saveMealFrom(e,e.meal))closeSheet()},
 sugpick(el){const m=ui.sugs[+el.dataset.i].m,f=el.closest('form');f.name.value=m.name;K.forEach(k=>f[k].value=m[k]);el.closest('.sug').innerHTML=''},
 spaste(el){const f=el.closest('form');ui.paste={meal:f&&f.meal?f.meal.value:'',date:f&&f.date?f.date.value:'',sums:[]};
  openSheet(`<h3>Smart Paste</h3><textarea id="ptx" rows="8" placeholder="Paste the macros from ChatGPT here…"></textarea><div class="btns"><button data-act="spclip">📋 Paste</button><button class="pri" data-act="sprecog">Recognise</button></div><small>Runs on your phone only. Nothing is saved until you press Save. If Paste is blocked, press and hold in the box and choose Paste.</small>`)},
 async spclip(){try{$('#ptx').value=await navigator.clipboard.readText()}catch(e){toast('Clipboard blocked – press and hold in the box, then tap Paste')}},
 sprecog(){const t=$('#ptx').value;if(!t.trim())return toast('Paste some text first');const s=parsePaste(t);if(!s.length)return toast('No calories or macros found – edit the text or enter them manually');ui.paste.sums=s;$('#panel').innerHTML=pasteView(s.length>1?null:0)},
 spuse(el){$('#panel').innerHTML=pasteView(+el.dataset.i)},spback(){$('#panel').innerHTML=pasteView(null)},
 impmerge(){S=mergeData(S,ui.imp);ui.imp=null;flush().then(()=>{closeSheet();render();toast('Backup merged')})},
 imprepl(){S=migrate(ui.imp);ui.imp=null;flush().then(()=>{closeSheet();render();toast('Backup restored')})},
 tab(el){ui.tab=el.dataset.t;ui.set=null;ui.recipeEdit=false;if(ui.tab==='add')ui.add='quick';render();scrollTo(0,0)},
 day(el){ui.date=addDays(ui.date,+el.dataset.n);render()},jump(){ui.date=today();render()},close:closeSheet,
 quick(el){openSheet(`<h3>Quick Add</h3>`+nutForm({meal:el.dataset.meal||guessMeal(),date:ui.date},'quick','Save'))},
 complete(){if(S.complete[ui.date])delete S.complete[ui.date];else S.complete[ui.date]=true;save();render()},
 edit(el){const e=findE(el.dataset.id);if(!e)return;openSheet(`<h3>Edit entry</h3>`+nutForm(e,'entry','Save changes',`<div class="btns" style="margin-top:10px"><button data-act="dup" data-id="${e.id}">Duplicate</button><button data-act="copyto" data-id="${e.id}">Copy to date</button><button data-act="favE" data-id="${e.id}">Save to My Meals</button><button class="dng" data-act="delE" data-id="${e.id}">Delete</button></div>`).replace('<input name="name"','<input name="name"'))},
 dup(el){const e=findE(el.dataset.id);S.entries.push({...e,id:uid()});save();closeSheet();render();toast('Duplicated')},
 delE(el){if(!confirm('Delete this entry?'))return;S.entries=S.entries.filter(e=>e.id!==el.dataset.id);save();closeSheet();render()},
 copyto(el){const e=findE(el.dataset.id);openSheet(`<h3>Copy to date</h3><form data-form="copy" data-id="${e.id}"><input name="date" type="date" value="${addDays(e.date,1)}"><select name="meal">${mealOpts(e.meal)}</select><button class="btn pri">Copy</button></form>`)},
 addtab(el){ui.add=el.dataset.v;render()},savetab(el){ui.saveTab=el.dataset.v;render()},
 sfav(el){const s=S.saved.find(x=>x.id===el.dataset.id);s.fav=!s.fav;save();closeSheet();render()},
 sdup(el){const s=S.saved.find(x=>x.id===el.dataset.id);S.saved.push({...s,id:uid(),name:s.name+' (copy)'});save();closeSheet();render()},
 sdel(el){if(!confirm('Delete this saved meal?'))return;S.saved=S.saved.filter(x=>x.id!==el.dataset.id);save();closeSheet();render()},
 pick(el){const i=S.ingredients.find(x=>x.id===el.dataset.id);ui.draft.items.push({name:i.name,q:100,unit:'g',n:{kcal:i.kcal,p:i.p,c:i.c,f:i.f},d:i.d||0,src:i.src});bumpRecent(i.id);ui.q='';ui.off=[];ui.offMsg='';save();render()},
 rmi(el){ui.draft.items.splice(+el.dataset.i,1);render()},
 async offsearch(){if(!ui.q.trim())return;ui.offMsg='Searching…';ui.off=[];$('#res').innerHTML=resHTML();
  try{const r=await fetch('https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=10&fields=product_name,nutriments&tagtype_0=countries&tag_contains_0=contains&tag_0=united-kingdom&search_terms='+encodeURIComponent(ui.q));const j=await r.json();
   ui.off=(j.products||[]).filter(p=>p.product_name&&p.nutriments&&p.nutriments['energy-kcal_100g']!=null).map(p=>{const n=p.nutriments;return{name:p.product_name,kcal:+n['energy-kcal_100g']||0,p:+n.proteins_100g||0,c:+n.carbohydrates_100g||0,f:+n.fat_100g||0}});ui.offMsg=ui.off.length?'':'No results found'}
  catch(e){ui.off=[];ui.offMsg='Could not reach Open Food Facts (are you offline?)'}$('#res').innerHTML=resHTML()},
 offuse(el){const o=ui.off[+el.dataset.i],ex=S.ingredients.find(i=>i.name===o.name&&K.every(k=>i[k]===o[k]));const ing=ex||{id:uid(),...o,d:0,src:'approx'};if(!ex)S.ingredients.push(ing);acts.pick({dataset:{id:ing.id}})},
 newing(el){openSheet(ingForm({name:el.dataset.name||''}))},editing(el){openSheet(ingForm(S.ingredients.find(i=>i.id===el.dataset.id)))},
 deling(el){if(!confirm('Delete this ingredient?'))return;S.ingredients=S.ingredients.filter(i=>i.id!==el.dataset.id);save();closeSheet();render()},
 mging(){ui.set='ingr';render();scrollTo(0,0)},setback(){ui.set=null;render()},
 bclear(){ui.draft=null;render()},
 badd(){const dr=ui.draft;if(!dr.items.length)return toast('Add at least one ingredient');if(dr.items.some(i=>i.bad))return toast('Fix invalid quantities');
  addEntry(ui.date,$('#bm').value,dr.name.trim()||'Custom ingredients',draftTot(dr));ui.draft=null;goToday(ui.date);toast('Added to diary')},
 bmeal(){const dr=ui.draft;if(!dr.items.length)return toast('Add at least one ingredient');if(dr.items.some(i=>i.bad))return toast('Fix invalid quantities');saveMealFrom({name:dr.name.trim()||'Custom ingredients',...draftTot(dr)},$('#bm').value,dr.items.map(i=>`${fmt(i.q,1)}${i.unit} ${i.name}`).join('\n'))},
 brecipe(){ui.tab='recipes';ui.recipeEdit=true;render();scrollTo(0,0)},
 rnew(){ui.draft={name:'',portions:1,items:[]};ui.recipeEdit=true;render()},
 redit(el){ui.draft=JSON.parse(JSON.stringify(S.recipes.find(r=>r.id===el.dataset.id)));ui.recipeEdit=true;render();scrollTo(0,0)},
 rcancel(){ui.draft=null;ui.recipeEdit=false;render()},
 rsave(){const dr=ui.draft,pn=Number(dr.portions);if(!dr.name.trim())return toast('Give the recipe a name');if(!dr.items.length)return toast('Add at least one ingredient');if(dr.items.some(i=>i.bad))return toast('Fix invalid quantities');if(!(pn>0))return toast('Portions must be greater than 0');
  const r={id:dr.id||uid(),name:dr.name.trim(),portions:pn,items:dr.items,fav:!!dr.fav};const i=S.recipes.findIndex(x=>x.id===r.id);if(i>=0)S.recipes[i]=r;else S.recipes.push(r);save();ui.draft=null;ui.recipeEdit=false;render();toast('Recipe saved')},
 rdup(el){const r=JSON.parse(JSON.stringify(S.recipes.find(x=>x.id===el.dataset.id)));r.id=uid();r.name+=' (copy)';S.recipes.push(r);save();render()},
 rfav(el){const r=S.recipes.find(x=>x.id===el.dataset.id);r.fav=!r.fav;save();render()},
 rdel(el){if(!confirm('Delete this recipe? Diary entries are not affected.'))return;S.recipes=S.recipes.filter(x=>x.id!==el.dataset.id);save();render()},
 radd(el){const r=S.recipes.find(x=>x.id===el.dataset.id);openSheet(`<h3>Add ${esc(r.name)}</h3><form data-form="portion" data-id="${r.id}"><label>Portions eaten<input name="n" type="number" inputmode="decimal" step="any" min="0" value="1"></label><div class="grid2"><label>Meal<select name="meal">${mealOpts(guessMeal())}</select></label><label>Date<input name="date" type="date" value="${ui.date}"></label></div><button class="btn pri">Add to diary</button></form>`)},
 range(el){ui.range=el.dataset.v;render()},metric(el){ui.metric=el.dataset.v;render()},
 parse(){ui.txt=$('#tx').value;ui.parsed=parseText(ui.txt);render()},
 parseadd(){let n=0;ui.parsed.forEach(x=>{if(x.err||!x.pick)return;const i=S.ingredients.find(y=>y.id===x.pick);if(!i)return;if(x.unit!=='g'&&!i.d)return toast(`${i.name}: no ml/spoon conversion – use grams`);
   ui.draft=ui.draft||{name:'',portions:1,items:[]};ui.draft.items.push({name:i.name,q:x.q,unit:x.unit,n:{kcal:i.kcal,p:i.p,c:i.c,f:i.f},d:i.d||0,src:i.src});bumpRecent(i.id);n++});
  if(n){ui.parsed=null;ui.txt='';ui.add='ingr';save();render();toast(n+' item(s) added')}else toast('Nothing matched yet – choose a match for each line')},
 export(){S.lastBackup=Date.now();save();const b=new Blob([JSON.stringify({app:'macro-tracker',exported:new Date().toISOString(),data:S},null,1)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`macro-backup-${today()}.json`;document.body.appendChild(a);a.click();a.remove();render()},
 async persist(){const ok=navigator.storage&&navigator.storage.persist?await navigator.storage.persist():false;toast(ok?'Storage protected':'Safari did not grant this – keep backups')}
};
function parseText(t){
 return t.split(/,|\n|;|\s+and\s+(?=\d)/i).map(s=>s.trim()).filter(Boolean).map(s=>{
  const m=s.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|tsp|tbsp|teaspoons?|tablespoons?)\b\s*(?:of\s+)?(.+)$/i);
  if(!m)return{raw:s,err:'Need a quantity with a unit first, e.g. 200g chicken breast'};
  let q=parseFloat(m[1].replace(',','.')),u=m[2].toLowerCase();
  if(u==='kg'){q*=1000;u='g'}else if(u==='l'){q*=1000;u='ml'}else if(u.startsWith('tea'))u='tsp';else if(u.startsWith('table'))u='tbsp';
  const query=m[3].trim(),w=query.toLowerCase().split(/\s+/).map(x=>x.replace(/s$/,''));
  const cands=S.ingredients.filter(i=>w.every(x=>i.name.toLowerCase().includes(x))).sort((a,b)=>a.name.length-b.name.length).slice(0,10);
  return{raw:s,q,unit:u,query,cands,pick:cands.length===1?cands[0].id:''}})}
const ins={
 nsearch(t){const q=t.value.trim().toLowerCase(),box=t.closest('form').querySelector('.sug');if(q.length<2){box.innerHTML='';return}ui.sugs=rankMeals(q).slice(0,5);
  box.innerHTML=ui.sugs.map((x,i)=>`<div class="row" data-act="sugpick" data-i="${i}"><div style="flex:1"><b>${x.m.fav?'★ ':''}${esc(x.m.name)}</b><small>${fmt(x.m.kcal)} kcal · ${macroLine(x.m)}</small></div><span class="b ${x.src==='s'?'verified':'approx'}">${x.src==='s'?'My Meals':'Logged'}</span></div>`).join('')},
 lport(){updPrev()},
 q(t){ui.q=t.value;$('#res').innerHTML=resHTML()},rq(t){ui.rq=t.value;$('#rlist').innerHTML=recipeList()},sq(t){ui.sq=t.value;$('#slist').innerHTML=savedList()},iq(t){ui.iq=t.value;$('#ilist').innerHTML=ingList()},
 addMeal(t){ui.addMeal=t.value},dname(t){ui.draft.name=t.value},dportions(t){ui.draft.portions=t.value.trim()===''?0:Number(t.value);updTotals()},
 qty(t){const it=ui.draft.items[+t.dataset.i],v=t.value.trim()===''?0:Number(t.value);it.bad=!(isFinite(v)&&v>=0);it.q=it.bad?0:v;t.classList.toggle('bad',it.bad);updTotals()},
 unit(t){ui.draft.items[+t.dataset.i].unit=t.value;updTotals()},
 pchoice(t){ui.parsed[+t.dataset.i].pick=t.value},
 from(t){ui.from=t.value;render()},to(t){ui.to=t.value;render()},theme(t){S.settings.theme=t.value;save();render()}};
const forms={
 quick(f){const n=readNut(f);if(!n)return false;if(!f.date.value){toast('Choose a date');return false}
  const miss=(f.dataset.miss||'').split(',').filter(k=>k&&f[k].value.trim()==='');
  if(miss.length&&!confirm(`${miss.map(k=>LBL[k]).join(', ')} not found in the pasted text and will be saved as 0. Continue?`))return false;
  const name=f.name.value.trim();if(f.savemeal&&f.savemeal.checked&&!saveMealFrom({name,...n},f.meal.value))return false;
  addEntry(f.date.value,f.meal.value,name,n);goToday(f.date.value);toast('Saved');return true},
 entry(f){const n=readNut(f);if(!n)return false;const e=findE(f.dataset.id);Object.assign(e,n,{name:f.name.value.trim()||'Quick add',meal:f.meal.value,date:f.date.value||e.date});save();closeSheet();render();return true},
 saved(f){const n=readNut(f);if(!n)return false;const pt=f.portion.value.trim()===''?1:Number(f.portion.value),name=f.name.value.trim();if(!(pt>0)){toast('Default portion must be above 0');return false}if(!name){toast('Name is required');return false}
  const o={name,...n,portion:pt,meal:f.meal.value,ing:f.ing.value.trim(),fav:f.fav.checked};
  if(f.dataset.id)Object.assign(S.saved.find(s=>s.id===f.dataset.id),o);else{if(S.saved.some(s=>sameMeal(s,o))){toast('Already in My Meals');return false}S.saved.push({id:uid(),count:0,last:0,...o})}
  save();closeSheet();render();return true},
 log(f){const n=Number(f.n.value),L=ui.log;if(!L||!(n>0)){toast('Portions must be above 0');return false}const b=L.b,v=K.reduce((o,k)=>(o[k]=b[k]*n,o),{});
  addEntry(f.date.value||ui.date,f.meal.value,n===1?b.name:`${b.name} ×${fmt(n,2)}`,v,L.src==='s'?b.id:undefined);
  if(L.src==='s'){b.meal=f.meal.value;b.last=Date.now();b.count=(b.count||0)+1}save();closeSheet();render();toast('Added to '+f.meal.value+' – see Today');return true},
 copy(f){const e=findE(f.dataset.id);if(!f.date.value)return false;const dup=S.entries.some(x=>x.date===f.date.value&&x.meal===f.meal.value&&x.name===e.name&&K.every(k=>x[k]===e[k]));
  if(dup&&!confirm('An identical entry already exists there. Copy anyway?'))return false;addEntry(f.date.value,f.meal.value,e.name,e);closeSheet();toast('Copied');return true},
 copyday(f){const src=S.entries.filter(e=>e.date===f.from.value&&(f.meal.value==='all'||e.meal===f.meal.value));if(!src.length){toast('Nothing to copy from that day');return false}
  if(S.entries.some(e=>e.date===ui.date&&(f.meal.value==='all'||e.meal===f.meal.value))&&!confirm('That meal already has entries on this date. Copy anyway?'))return false;
  src.forEach(e=>S.entries.push({...e,id:uid(),date:ui.date}));save();goToday(ui.date);toast(src.length+' entries copied');return true},
 portion(f){const n=Number(f.n.value),r=S.recipes.find(x=>x.id===f.dataset.id);if(!(n>0)){toast('Portions must be greater than 0');return false}const t=draftTot(r),v=K.reduce((o,k)=>(o[k]=t[k]/r.portions*n,o),{});
  addEntry(f.date.value||ui.date,f.meal.value,r.name+(n!==1?` ×${fmt(n,2)}`:''),v);goToday(f.date.value||ui.date);toast('Added to diary');return true},
 ingr(f){const n=readNut(f),d=f.d.value.trim()===''?0:Number(f.d.value);if(!n||!isFinite(d)||d<0){toast('Check the values');return false}if(!f.name.value.trim())return false;
  const ex=f.dataset.id&&S.ingredients.find(i=>i.id===f.dataset.id);let src=f.src.value;
  if(ex){if(K.some(k=>ex[k]!==n[k])&&src===ex.src&&src!=='manual')src='manual';Object.assign(ex,n,{name:f.name.value.trim(),d,src})}else S.ingredients.push({id:uid(),name:f.name.value.trim(),...n,d,src});
  save();closeSheet();ui.q='';render();return true},
 goals(f){const n=readNut(f);if(!n)return false;if(!f.from.value)return false;const g={from:f.from.value,...n,type:f.type.value};
  if(!S.goalsSet){S.goals=[{...g,from:'1970-01-01'}];S.goalsSet=true}else{S.goals=S.goals.filter(x=>x.from!==g.from);S.goals.push(g);S.goals.sort((a,b)=>a.from.localeCompare(b.from))}save();render();toast('Goals saved');return true},
 rules(f){for(const k of K){const t=f[k+'_t'].value.trim()===''?0:Number(f[k+'_t'].value);if(!isFinite(t)||t<0){toast('Tolerance must be 0 or more');return false}S.rules[k]={mode:f[k+'_m'].value,tol:t}}save();toast('Rules saved');return true}};
if(typeof document!=='undefined'){
 document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;const f=acts[el.dataset.act];if(f){e.preventDefault();f(el)}});
 document.addEventListener('submit',e=>{const f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();if(f.dataset.busy)return;f.dataset.busy=1;if(!forms[f.dataset.form](f))delete f.dataset.busy});
 const onIn=e=>{const h=ins[e.target.dataset&&e.target.dataset.in];if(h)h(e.target)};document.addEventListener('input',onIn);document.addEventListener('change',onIn);
 document.addEventListener('change',e=>{if(e.target.id!=='imp')return;const file=e.target.files[0];e.target.value='';if(!file)return;const r=new FileReader();
  r.onload=()=>{let d;try{const j=JSON.parse(r.result);d=j.data||j}catch(x){return toast('That file is not a valid backup')}const err=validBackup(d);if(err)return toast(err);ui.imp=d;
   openSheet(`<h3>Restore backup</h3><small>This file has ${d.entries.length} diary entries, ${(d.saved||[]).length} saved meals, ${(d.recipes||[]).length} recipes and ${d.ingredients.length} ingredients.</small><button class="btn pri" data-act="impmerge" style="margin-top:10px">Merge into my current data</button><small>Keeps everything you have now and adds what is missing.</small><button class="btn dng" data-act="imprepl">Replace everything with this backup</button><small>Tip: export a backup of your current data first.</small><button class="btn" data-act="close">Cancel</button>`)};r.readAsText(file)});
 document.addEventListener('focusin',e=>{if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))setTimeout(()=>{try{e.target.scrollIntoView({block:'center',behavior:'smooth'})}catch(x){}},350)});
 if(window.visualViewport)visualViewport.addEventListener('resize',()=>{$('#nav').style.display=innerHeight-visualViewport.height>120?'none':''});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&S)flush()});addEventListener('pagehide',()=>{if(S)flush()});
 const legacyGet=()=>new Promise((res,rej)=>{const r=indexedDB.open('macro-tracker');r.onupgradeneeded=()=>r.transaction.abort();r.onerror=()=>rej(r.error);r.onsuccess=()=>{try{const q=r.result.transaction('kv').objectStore('kv').get('state');q.onsuccess=()=>{r.result.close();res(q.result)};q.onerror=()=>rej(q.error)}catch(e){rej(e)}}});
 (async()=>{try{S=await DB.get('state')}catch(e){}
  if(!S){try{S=await legacyGet();if(S)save()}catch(e){S=null}}
  if(!S){S=defState();save()}S=migrate(S);render();
  if('serviceWorker' in navigator){const had=navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!window._rl){window._rl=1;location.reload()}});navigator.serviceWorker.register('sw.js').catch(()=>{})}})()}
if(typeof module!=='undefined')module.exports={parsePaste,rankMeals,mergeData,validBackup,migrate,SEED,draftTot,grams,meets,parseText,fmt,addDays,goalFor,stats,dayTot,_set:s=>{S=s},defState,rangeDays};
