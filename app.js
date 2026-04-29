/* app.js — Cornerstone Council Agent Portal v5 */
'use strict';

let cur=null;
const TF={home:'month',lb:'month',dash:'month',teams:'month',cons:'ytd',rpt:'month'};
let manageTab='users';
let charts={};
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MNF=['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── UTILS ──────────────────────────────────────────────────────
function fmtNum(n){if(!n||isNaN(n))return'0';return Number(n).toLocaleString('en-US',{maximumFractionDigits:0});}
function fmt$(n){if(!n||isNaN(n))return'$0';n=Number(n);if(n>=1e6)return'$'+(n/1e6).toFixed(2)+'M';if(n>=1000)return'$'+(n/1000).toFixed(1)+'K';return'$'+fmtNum(n);}
function fmtFull(n){if(!n||isNaN(n))return'$0';return'$'+fmtNum(n);}
function fmtDate(d){if(!d)return'';const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function cap(s){return s?s[0].toUpperCase()+s.slice(1):'';}
function initials(name){return(name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();}
function isAdmin(){return cur&&['admin','owner'].includes(cur.role);}
function isOwner(){return cur&&cur.role==='owner';}
function isManager(){return cur?.agentId&&Store.isManager(cur.agentId);}
function canSeeRecruitPosts(targetAgentId){
  if(isOwner())return true;
  if(cur.agentId===targetAgentId)return true;
  // manager of this agent
  if(cur.agentId){const downIds=Store.getDownlineIds(cur.agentId);return downIds.includes(targetAgentId);}
  return false;
}
function tfLabel(tf){return{today:'Today',week:'Week',month:'Month',ytd:'YTD',alltime:'All Time','1d':'Today','7d':'Last 7 Days','30d':'Last 30 Days','90d':'Last 90 Days',custom:'Custom',daily:'Daily',weekly:'Weekly',monthly:'Monthly',quarterly:'Quarterly',semiannual:'Semi-Annual',annual:'Annual',lifetime:'Lifetime'}[tf]||tf;}

function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200);}
function openMod(id){const el=document.getElementById(id);if(el)el.classList.add('open');}
function closeMod(id){const el=document.getElementById(id);if(el)el.classList.remove('open');}


// Returns worn badge emoji + birthday cake if applicable for an agentId
function agentBadgeDisplay(agentId, dealDate){
  const u = Store.users.find(x=>x.agentId===agentId);
  if(!u) return '';
  let icons = '';
  // Birthday cake — show if deal was posted on their birthday
  if(dealDate){
    const m = Store.getMember(agentId);
    if(m?.dob){
      const dob = new Date(m.dob+'T12:00:00');
      const dd = new Date(dealDate+'T12:00:00');
      if(dob.getMonth()===dd.getMonth()&&dob.getDate()===dd.getDate()){
        icons += `<span title="Posted on their birthday!" style="font-size:13px;margin-right:2px">🎂</span>`;
      }
    }
  }
  // Worn badge
  if(u.wornBadgeId){
    const badge=(u.badges||[]).find(b=>b.id===u.wornBadgeId);
    if(badge) icons += `<span class="worn-badge-icon" style="font-size:13px;margin-right:2px">${badge.emoji||'🏅'}<span class="badge-tooltip">${badge.name}</span></span>`;
  }
  return icons;
}

// ── CONFIRM DIALOG ─────────────────────────────────────────────
let _confirmResolve=null;
function showConfirm(title,msg,okLabel='Confirm',danger=true){
  return new Promise(res=>{
    _confirmResolve=res;
    document.getElementById('confirm-title').textContent=title;
    document.getElementById('confirm-msg').textContent=msg;
    const btn=document.getElementById('confirm-ok-btn');
    btn.textContent=okLabel;btn.className='btn '+(danger?'btn-dan':'btn-pri');
    document.getElementById('confirm-ov').classList.add('open');
  });
}
function closeConfirm(result){document.getElementById('confirm-ov').classList.remove('open');if(_confirmResolve){_confirmResolve(result);_confirmResolve=null;}}

// ── SESSION ────────────────────────────────────────────────────
const SESSION_KEY='cc_session';const INACTIVITY_MS=10*60*1000;let _inactivityTimer=null;
function _saveSession(u){localStorage.setItem(SESSION_KEY,JSON.stringify({userId:u.id,savedAt:Date.now()}));}
function _clearSession(){localStorage.removeItem(SESSION_KEY);}
function _loadSession(){try{const s=JSON.parse(localStorage.getItem(SESSION_KEY));if(!s)return null;if(Date.now()-s.savedAt>INACTIVITY_MS){_clearSession();return null;}return s;}catch(e){return null;}}
function _resetTimer(){clearTimeout(_inactivityTimer);const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(s)localStorage.setItem(SESSION_KEY,JSON.stringify({...s,savedAt:Date.now()}));_inactivityTimer=setTimeout(()=>{doLogout();toast('Signed out due to inactivity');},INACTIVITY_MS);}
function _startActivity(){['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(e=>document.addEventListener(e,_resetTimer,{passive:true}));_resetTimer();}
function _stopActivity(){clearTimeout(_inactivityTimer);['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(e=>document.removeEventListener(e,_resetTimer));}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.modal-ov').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open');}));
  Store.loadLocal();GH.load();
  // Hide dashboard from owner
  const dashTab=Array.from(document.querySelectorAll('.tab')).find(t=>(t.getAttribute('onclick')||'').includes("'dashboard'"));
  if(dashTab)dashTab.style.display=isOwner()?'none':'';
  document.getElementById('pd-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('sp-week').value=Store.getMondayOf(new Date().toISOString().split('T')[0]);
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();doUndo();}
    else if((e.metaKey||e.ctrlKey)&&((e.key==='z'&&e.shiftKey)||e.key==='y')){e.preventDefault();doRedo();}
  });
  const session=_loadSession();
  if(session){Store.loadLocal();const u=Store.users.find(x=>x.id===session.userId&&x.active!==false);if(u){cur=u;enterApp();_startActivity();Store.syncFromGH().then(ok=>{if(ok){refresh();GH.startLiveSync();}});}}
});

// ── AUTH ───────────────────────────────────────────────────────
function doLogin(){
  Store.loadLocal();
  const un=document.getElementById('l-user').value.trim();
  const pw=document.getElementById('l-pass').value;
  const u=Store.users.find(u=>u.username.toLowerCase()===un.toLowerCase()&&u.pwd===pw&&u.active!==false);
  if(!u){document.getElementById('l-err').style.display='block';return;}
  document.getElementById('l-err').style.display='none';
  cur=u;_saveSession(u);enterApp();_startActivity();
  Store.syncFromGH().then(ok=>{if(ok){refresh();toast('Synced from Firebase');}});
}
function doLogout(){_clearSession();_stopActivity();cur=null;document.getElementById('app').style.display='none';document.getElementById('login-page').style.display='flex';document.getElementById('l-user').value='';document.getElementById('l-pass').value='';}

function _setHdrAvatar(u){const av=document.getElementById('hdr-av');if(!av)return;if(u?.avatar){av.innerHTML=`<img src="${u.avatar}" alt="">`;}else{av.textContent=initials(u?.agentName||u?.username||'');}}

function _updateWornBadge(){
  const wrap=document.getElementById('worn-badge-wrap');if(!wrap)return;
  if(!cur?.agentId){wrap.innerHTML='';return;}
  const slots=(cur.wornBadges||[cur.wornBadgeId||'','','']).slice(0,3);
  const icons=slots.filter(id=>id).map(id=>{
    const b=(cur.badges||[]).find(x=>x.id===id);
    if(!b)return'';
    return`<span class="worn-badge-icon" style="margin-right:2px">${b.emoji||'🏅'}<span class="badge-tooltip">${b.name}</span></span>`;
  }).join('');
  wrap.innerHTML=icons;
}

function enterApp(){
  document.getElementById('login-page').style.display='none';
  document.getElementById('app').style.display='flex';
  const nm=cur.agentName||cur.username;
  _setHdrAvatar(cur);
  document.getElementById('hdr-nm').textContent=(cur.agentName||cur.username).split(' ')[0];
  const rb=document.getElementById('hdr-role');
  // Auto-promote to manager if they have CRM downlines (regardless of portal accounts)
  const hasDownlines=cur.agentId&&Store.getDownlineIds(cur.agentId).length>0;
  const effRole=(!['admin','owner'].includes(cur.role)&&hasDownlines)?'manager':cur.role;
  const rl={owner:'Owner',admin:'Admin',manager:'Manager',agent:'Agent'};
  rb.textContent=(rl[effRole]||effRole).toUpperCase();
  rb.className='role-badge rb-'+(cur.role==='owner'?'owner':cur.role==='admin'?'admin':effRole==='manager'?'manager':'agent');
  document.querySelectorAll('.admin-tab').forEach(el=>el.style.display=isAdmin()?'':'none');
  document.querySelectorAll('.owner-tab').forEach(el=>el.style.display=isOwner()?'':'none');
  document.getElementById('recruit-btn').style.display=isOwner()?'':'none';
  document.getElementById('undo-btn').style.display=isAdmin()?'':'none';
  document.getElementById('redo-btn').style.display=isAdmin()?'':'none';
  document.getElementById('elite-info-box').style.display=isOwner()?'':'none';
  document.getElementById('astro-section').style.display=isOwner()?'':'none';
  document.getElementById('add-inc-btn').style.display=isOwner()?'':'none';
  // Hide dashboard from owner
  const dashTab=Array.from(document.querySelectorAll('.tab')).find(t=>(t.getAttribute('onclick')||'').includes("'dashboard'"));
  if(dashTab)dashTab.style.display=isOwner()?'none':'';
  document.getElementById('pd-date').value=new Date().toISOString().split('T')[0];
  Store.updateUndoBtns();GH.updateStatus(null);
  // Check birthday warrior
  _checkBirthdayWarrior();
  _updateWornBadge();
  GH.startLiveSync();
  switchTab('home');
  _autoSaveMonthlyReport();
}



function _seedDefaultIncentives(){
  // AMAM Trip Winner — public, yearly
  if(!Store.incentives.find(x=>x.id==='amam-trip-winner')){
    Store.incentives.push({
      id:'amam-trip-winner',
      title:'AMAM Trip Winner',
      emoji:'🦮',
      badgeTitle:'AMAM Trip Winner',
      scope:'personal',
      metric:'ap',
      timeframe:'annual',
      goal:134000,
      reward:'AMAM Annual Trip',
      desc:'Submit $134,000 AP through American Amicable alone within the year to earn the AMAM Trip Winner badge.',
      startDate:new Date().getFullYear()+'-01-01',
      endDate:new Date().getFullYear()+'-12-31',
      hidden:false,
      createdAt:new Date().toISOString(),
    });
    Store.saveAll();
  }
  // Birthday Warrior — hidden, lifetime (auto-awarded)
  if(!Store.incentives.find(x=>x.id==='birthday-warrior')){
    Store.incentives.push({
      id:'birthday-warrior',
      title:'Birthday Warrior',
      emoji:'🎂',
      badgeTitle:'Birthday Warrior',
      scope:'personal',
      metric:'deals',
      timeframe:'lifetime',
      goal:1,
      reward:'Birthday Warrior Badge',
      desc:'Post a deal on your birthday. Auto-awarded.',
      hidden:true,
      createdAt:new Date().toISOString(),
    });
    Store.saveAll();
  }
}

async function _checkBirthdayWarrior(){
  if(!cur.agentId) return;
  const m = Store.getMember(cur.agentId);
  if(!m?.dob) return;
  const today = new Date();
  const dob = new Date(m.dob+'T12:00:00');
  if(dob.getMonth()!==today.getMonth()||dob.getDate()!==today.getDate()) return;
  // Check if they posted a deal today
  const todayStr = today.toISOString().split('T')[0];
  const todayDeals = Store.deals.filter(d=>d.agentId===cur.agentId&&d.date===todayStr);
  if(!todayDeals.length) return; // no deal today = no badge
  // Check if already has badge
  const u = Store.users.find(x=>x.id===cur.id);
  if(!u) return;
  if((u.badges||[]).some(b=>b.birthdayWarrior===true)) return;
  // Award it
  if(!u.badges) u.badges=[];
  u.badges.push({id:'bw-'+Store.uid(),emoji:'🎂',name:'Birthday Warrior',earnedAt:new Date().toISOString(),birthdayWarrior:true,manual:false});
  cur.badges=u.badges;
  await Store.saveAll();
  toast('🎂 Happy Birthday! You earned the Birthday Warrior badge!');
  _updateWornBadge();
}

async function doUndo(){if(await Store.undo()){refresh();toast('Undo');}}
async function doRedo(){if(await Store.redo()){refresh();toast('Redo');}}

// ── TABS ───────────────────────────────────────────────────────
function switchTab(name,btn){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const v=document.getElementById('view-'+name);if(v)v.classList.add('active');
  if(btn)btn.classList.add('active');
  else{const f=Array.from(document.querySelectorAll('.tab')).find(t=>(t.getAttribute('onclick')||'').includes("'"+name+"'"));if(f)f.classList.add('active');}
  Store.loadLocal();
  const r={home:renderHome,dashboard:renderDashboard,leaderboard:renderLeaderboard,teams:renderTeams,consistency:renderConsistency,incentives:renderIncentives,manage:renderManage,reports:renderReports};
  if(r[name])r[name]();
}

function switchManageTab(tab,btn){
  manageTab=tab;
  document.querySelectorAll('[id^=mt-]').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  ['users','deals','badges'].forEach(t=>{const el=document.getElementById('manage-'+t+'-div');if(el)el.style.display=t===tab?'':'none';});
  if(tab==='users')renderManageUsers();
  else if(tab==='deals')renderManageDeals();
  else if(tab==='badges')renderBadgeFeed();
}

function setTF(view,tf,btn){
  TF[view]=tf;
  const viewIds={home:'home',lb:'leaderboard',dash:'dashboard',teams:'teams',cons:'consistency',rpt:'reports'};
  document.querySelectorAll(`#view-${viewIds[view]||view} .tf-btn`).forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  const customs={lb:'lb-custom',teams:'teams-custom',rpt:'rpt-custom'};
  const cd=customs[view];if(cd){const el=document.getElementById(cd);if(el){tf==='custom'?el.classList.add('show'):el.classList.remove('show');}}
  const renders={home:renderHome,lb:renderLeaderboard,dash:renderDashboard,teams:renderTeams,cons:renderConsistency,rpt:renderReports};
  if(renders[view])renders[view]();
}

function refresh(){const a=document.querySelector('.view.active');if(!a)return;Store.loadLocal();switchTab(a.id.replace('view-',''));}

// ── CHART HELPERS ──────────────────────────────────────────────
function _homeChartConfig(tf){
  const now=new Date();
  if(tf==='1d'||tf==='today'){const labels=[];const data=[];for(let h=0;h<24;h++){labels.push(h+':00');data.push(Store.totalAP(Store.deals.filter(d=>{const dd=new Date(d.date+'T12:00:00');return dd.toDateString()===now.toDateString()&&dd.getHours()<=h;})));}return{labels,data};}
  if(tf==='7d'||tf==='week'){const labels=[];const data=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);labels.push(MN[d.getMonth()]+' '+d.getDate());const ds=d.toISOString().split('T')[0];data.push(Store.totalAP(Store.deals.filter(x=>x.date===ds)));}return{labels,data};}
  if(tf==='30d'){const labels=[];const data=[];for(let i=29;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);labels.push(i%5===0?MN[d.getMonth()]+' '+d.getDate():'');const ds=d.toISOString().split('T')[0];data.push(Store.totalAP(Store.deals.filter(x=>x.date===ds)));}return{labels,data};}
  if(tf==='90d'){const labels=[];const data=[];for(let i=12;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i*7);labels.push(MN[d.getMonth()]+' '+d.getDate());const wk=Store.getMondayOf(d.toISOString().split('T')[0]);const wkEnd=new Date(wk+'T12:00:00');wkEnd.setDate(wkEnd.getDate()+6);data.push(Store.totalAP(Store.deals.filter(x=>{const dd=new Date(x.date+'T12:00:00');return dd>=new Date(wk+'T00:00:00')&&dd<=wkEnd;})));}return{labels,data};}
  const count=tf==='alltime'?18:tf==='ytd'?now.getMonth()+1:12;
  const labels=[];const data=[];
  for(let i=count-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);labels.push(MN[d.getMonth()]+"'"+(String(d.getFullYear()).slice(2)));data.push(Store.totalAP(Store.deals.filter(x=>{const dd=new Date(x.date+'T12:00:00');return dd.getFullYear()===d.getFullYear()&&dd.getMonth()===d.getMonth();})));}
  return{labels,data};
}

// ── HOME ───────────────────────────────────────────────────────
function renderHome(){
  Store.loadLocal();
  const tf=TF.home;const now=new Date();const nm=cur.agentName?.split(' ')[0]||cur.username;
  document.getElementById('home-welcome').innerHTML=`Welcome back, <strong style="font-style:normal;color:var(--g2)">${nm}</strong> &mdash; ${now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}`;
  const filt=Store.filterByTF(Store.deals,tf,'date');
  const todayD=Store.filterByTF(Store.deals,'today','date');
  const weekD=Store.filterByTF(Store.deals,'week','date');
  const monthD=Store.filterByTF(Store.deals,'month','date');
  document.getElementById('home-stats').innerHTML=`
    <div class="sc"><div class="sc-label">Agency AP — ${tfLabel(tf)}</div><div class="sc-val">${fmt$(Store.totalAP(filt))}</div><div class="sc-sub">${filt.length} deals</div></div>
    <div class="sc"><div class="sc-label">Today</div><div class="sc-val wh">${fmt$(Store.totalAP(todayD))}</div><div class="sc-sub">${todayD.length} deals</div></div>
    <div class="sc"><div class="sc-label">This Week</div><div class="sc-val wh">${fmt$(Store.totalAP(weekD))}</div><div class="sc-sub">${weekD.length} deals</div></div>
    <div class="sc"><div class="sc-label">This Month</div><div class="sc-val sm">${fmt$(Store.totalAP(monthD))}</div><div class="sc-sub">${monthD.length} deals</div></div>
    <div class="sc"><div class="sc-label">Active Agents</div><div class="sc-val wh">${Store.getAgentUsers().length}</div></div>`;
  const lbl={'1d':'Today by Hour','7d':'Last 7 Days','30d':'Last 30 Days','90d':'Last 90 Days',month:'Last 12 Months',ytd:'Year to Date',alltime:'All Time'};
  document.getElementById('home-chart-label').textContent='Agency Production — '+(lbl[tf]||tf);
  const{labels,data}=_homeChartConfig(tf);
  const ctx=document.getElementById('chart-home').getContext('2d');
  if(charts.home)charts.home.destroy();
  charts.home=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'AP',data,fill:true,borderColor:'#c9a84c',backgroundColor:'rgba(201,168,76,0.07)',tension:0.4,pointBackgroundColor:'#c9a84c',pointRadius:3,pointHoverRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'AP: '+fmtFull(c.raw)}}},scales:{x:{grid:{color:'rgba(201,168,76,0.05)'},ticks:{color:'#6a6050',font:{size:10,family:'Georgia,serif'}}},y:{grid:{color:'rgba(201,168,76,0.05)'},ticks:{color:'#6a6050',font:{size:10,family:'Georgia,serif'},callback:v=>fmt$(v)}}}}});
  const allDeals=[...Store.deals].sort((a,b)=>new Date(b.date)-new Date(a.date));
  document.getElementById('home-deals').innerHTML=allDeals.length?allDeals.map(d=>dealRowHtml(d,true)).join(''):'<div class="empty">No deals yet.</div>';
}

// ── LEADERBOARD ────────────────────────────────────────────────
function renderLeaderboard(){
  Store.loadLocal();
  const tf=TF.lb;const cs=document.getElementById('lb-cs')?.value||null;const ce=document.getElementById('lb-ce')?.value||null;
  const lb=Store.buildLB(tf,cs,ce);const maxAP=lb.length?lb[0].ap:1;
  document.getElementById('lb-ct').textContent='Rankings — '+tfLabel(tf);
  const ctx=document.getElementById('chart-lb').getContext('2d');
  if(charts.lb)charts.lb.destroy();
  charts.lb=new Chart(ctx,{type:'bar',data:{labels:lb.map(r=>r.name.split(' ')[0]),datasets:[{label:'AP',data:lb.map(r=>r.ap),backgroundColor:lb.map((_,i)=>i===0?'rgba(201,168,76,0.75)':i===1?'rgba(160,160,160,0.5)':i===2?'rgba(139,80,20,0.6)':'rgba(201,168,76,0.22)'),borderColor:lb.map((_,i)=>i===0?'#c9a84c':i===1?'#aaa':i===2?'#8a5010':'rgba(201,168,76,0.4)'),borderWidth:1,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'AP: '+fmtFull(c.raw)}}},scales:{x:{grid:{color:'rgba(201,168,76,0.05)'},ticks:{color:'#6a6050',font:{size:10,family:'Georgia,serif'}}},y:{grid:{color:'rgba(201,168,76,0.05)'},ticks:{color:'#6a6050',font:{size:10,family:'Georgia,serif'},callback:v=>fmt$(v)}}}}});
  let html=`<thead><tr><th>Rank</th><th>Agent</th><th>AP</th><th>Monthly Prem.</th><th>Deals</th><th>Avg AP</th></tr></thead><tbody>`;
  if(!lb.length){html+=`<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--d)">No data.</td></tr>`;}
  else lb.forEach((r,i)=>{const rc=i===0?'r1':i===1?'r2':i===2?'r3':'rn';const pct=maxAP>0?Math.round((r.ap/maxAP)*100):0;const u=Store.users.find(x=>x.agentId===r.agentId);const avImg=u?.avatar?`<img src="${u.avatar}" alt="">`:initials(r.name);
    html+=`<tr onclick="openProfile('${r.agentId}')"><td><div class="rank-badge ${rc}">${i+1}</div></td><td><div class="agent-cell"><div class="agent-av-sm">${avImg}</div><div><div class="agent-nm">${agentBadgeDisplay(r.agentId,null)} ${r.name}</div><div class="agent-ag">${Store.agN(r.agencyId)}</div></div></div></td><td><div class="ap-cell">${fmtFull(r.ap)}</div><div class="bar-wrap"><div class="bar-fill" style="width:${pct}%"></div></div></td><td style="color:var(--d2)">${fmtFull(r.mp)}</td><td><span class="badge badge-g">${r.count}</span></td><td style="color:var(--d2)">${r.count?fmt$(r.ap/r.count):'—'}</td></tr>`;
  });
  document.getElementById('lb-tbl').innerHTML=html+'</tbody>';
}

// ── DASHBOARD ──────────────────────────────────────────────────
function renderDashboard(){
  Store.loadLocal();
  renderPersonalGoals(); // always render goals first (handles own visibility)
  if(!cur.agentId){document.getElementById('dash-stats').innerHTML='<div class="empty" style="grid-column:1/-1">Not linked to an agent profile.</div>';return;}
  const tf=TF.dash;const agentId=cur.agentId;
  const myDeals=Store.deals.filter(d=>d.agentId===agentId);
  const filt=Store.filterByTF(myDeals,tf,'date');
  const mySpend=Store.spend.filter(s=>s.agentId===agentId);
  const filtSpend=Store.filterByTF(mySpend,tf,'weekOf');
  const ap=Store.totalAP(filt);const totalSpend=filtSpend.reduce((s,x)=>s+(x.amount||0),0);
  const todayAP=Store.totalAP(Store.filterByTF(myDeals,'today','date'));
  const weekAP=Store.totalAP(Store.filterByTF(myDeals,'week','date'));
  const monthAP=Store.totalAP(Store.filterByTF(myDeals,'month','date'));
  const totalRefs=filt.reduce((s,d)=>s+(d.referrals||0),0);
  const warmRefs=filt.filter(d=>d.leadType==='Warm Market').length;
  document.getElementById('dash-stats').innerHTML=`
    <div class="sc"><div class="sc-label">Today</div><div class="sc-val">${fmt$(todayAP)}</div><div class="sc-sub">${Store.filterByTF(myDeals,'today','date').length} deals</div></div>
    <div class="sc"><div class="sc-label">This Week</div><div class="sc-val wh">${fmt$(weekAP)}</div><div class="sc-sub">${Store.filterByTF(myDeals,'week','date').length} deals</div></div>
    <div class="sc"><div class="sc-label">This Month</div><div class="sc-val sm">${fmt$(monthAP)}</div><div class="sc-sub">${Store.filterByTF(myDeals,'month','date').length} deals</div></div>
    <div class="sc"><div class="sc-label">Lead Spend</div><div class="sc-val rd">${fmt$(totalSpend)}</div></div>`;
  // Private referral view
  const commRate=parseFloat(cur.commission)||0;
  const commEl=document.getElementById('my-commission-card');
  const refsHtml=`<div class="card"><div class="ct">My Referrals — ${tfLabel(tf)} <span class="badge badge-grey" style="font-size:8px">Private</span></div>
    <div class="stat-grid">
      <div class="sc"><div class="sc-label">Beneficiary Refs</div><div class="sc-val">${totalRefs}</div><div class="sc-sub">from closes</div></div>
      <div class="sc"><div class="sc-label">Warm Market Closes</div><div class="sc-val wh">${warmRefs}</div><div class="sc-sub">counts as warm ref</div></div>
      <div class="sc"><div class="sc-label">Total Referrals</div><div class="sc-val sm">${totalRefs+warmRefs}</div></div>
    </div></div>`;
  if(commRate>0){
    const earned=ap*(commRate/100);const net=earned-totalSpend;const roi=totalSpend>0?((net/totalSpend)*100).toFixed(1):null;
    commEl.innerHTML=`<div class="card"><div class="ct">My Earnings &amp; ROI <span class="badge badge-g" style="font-size:8px">Private</span></div>
      <div class="stat-grid">
        <div class="sc"><div class="sc-label">Commission</div><div class="sc-val">${commRate}%</div></div>
        <div class="sc"><div class="sc-label">Est. Earnings</div><div class="sc-val sm">${fmt$(earned)}</div></div>
        <div class="sc"><div class="sc-label">Lead Spend</div><div class="sc-val rd">${fmt$(totalSpend)}</div></div>
        <div class="sc"><div class="sc-label">Net Earnings</div><div class="sc-val ${net>=0?'sm':'rd'}">${fmt$(net)}</div></div>
        ${roi!==null?`<div class="sc"><div class="sc-label">ROI</div><div class="sc-val ${Number(roi)>=0?'sm':'rd'}">${roi}%</div></div>`:''}
      </div><div class="priv-box">&#128274; Visible only to you.</div></div>${refsHtml}`;
  }else{commEl.innerHTML=refsHtml;}
  const sorted=[...filt].sort((a,b)=>new Date(b.date)-new Date(a.date));
  document.getElementById('my-deals-list').innerHTML=sorted.length?sorted.map(d=>dealRowHtml(d,false)).join(''):'<div class="empty">No deals for this period.</div>';
  const sortedSpend=[...mySpend].sort((a,b)=>new Date(b.weekOf)-new Date(a.weekOf));
  document.getElementById('my-spend-list').innerHTML=sortedSpend.length?
    sortedSpend.map(s=>`<div class="deal-row"><div class="deal-top"><div><div class="fw7">Week of ${fmtDate(s.weekOf)}</div><div class="deal-meta">${s.notes||'No notes'}</div></div><div class="fl"><div class="text-rd fw7">${fmt$(s.amount)}</div><button class="btn btn-dan btn-xs" onclick="delSpend('${s.id}',event)">Remove</button></div></div></div>`).join('')
    :'<div class="empty">No lead spend recorded.</div>';
  // Recruit posts
  const rpCard=document.getElementById('recruit-posts-card');
  if(rpCard){rpCard.style.display='';renderRecruitPosts();}
  // Chargebacks + persistency
  renderChargebackSection();
}

// ── TEAMS ──────────────────────────────────────────────────────
function renderTeams(){
  Store.loadLocal();
  const tf=TF.teams;const cs=document.getElementById('teams-cs')?.value||null;const ce=document.getElementById('teams-ce')?.value||null;
  const filt=Store.filterByTF(Store.deals,tf,'date',cs,ce);
  const au=Store.getAgentUsers();const totalAll=Store.totalAP(filt);
  let html=`<div class="stat-grid" style="margin-bottom:14px">
    <div class="sc"><div class="sc-label">Agency AP — ${tfLabel(tf)}</div><div class="sc-val">${fmt$(totalAll)}</div></div>
    <div class="sc"><div class="sc-label">Agents</div><div class="sc-val wh">${au.length}</div></div>
    <div class="sc"><div class="sc-label">Total Deals</div><div class="sc-val wh">${filt.length}</div></div>
  </div>`;
  const teamData=au.map(u=>{
    const myD=filt.filter(d=>d.agentId===u.agentId);
    const downIds=Store.getDownlineIds(u.agentId);
    const downUsers=au.filter(du=>downIds.includes(du.agentId)&&du.agentId!==u.agentId);
    const downD=filt.filter(d=>downIds.includes(d.agentId)&&d.agentId!==u.agentId);
    return{u,personalAP:Store.totalAP(myD),teamAP:Store.totalAP(myD)+Store.totalAP(downD),downUsers,myD,downD};
  }).sort((a,b)=>b.teamAP-a.teamAP);
  const myDownIds=cur.agentId?Store.getDownlineIds(cur.agentId):[];
  // Only show agents who have at least one downline with a portal account
  const teamsOnly=teamData.filter(td=>td.downUsers.length>0);
  const viewable=isAdmin()?teamsOnly:teamsOnly.filter(td=>td.u.agentId===cur.agentId||myDownIds.includes(td.u.agentId));
  viewable.forEach(({u,personalAP,teamAP,downUsers,myD,downD})=>{
    const m=Store.getMember(u.agentId);const avImg=u.avatar?`<img src="${u.avatar}" alt="">`:initials(u.agentName);
    const allTeamDeals=[...myD,...downD].sort((a,b)=>new Date(b.date)-new Date(a.date));
    html+=`<div class="team-card" id="tc-${u.id}">
      <div class="team-hdr" onclick="toggleTeam('${u.id}')">
        <div class="fl" style="gap:10px">
          <div class="agent-av-sm" style="width:40px;height:40px;font-size:13px;cursor:pointer" onclick="openProfile('${u.agentId}',event)">${avImg}</div>
          <div><div style="font-size:14px;font-weight:700;color:var(--t);cursor:pointer" onclick="openProfile('${u.agentId}',event)">${agentBadgeDisplay(u.agentId,null)} ${u.agentName}</div>
          <div style="font-size:10px;color:var(--d2);margin-top:2px">${Store.agN(m?.agency)} · ${downUsers.length} downline · ${myD.length} personal deals</div></div>
        </div>
        <div style="text-align:right"><div style="font-size:18px;font-weight:700;color:var(--g)">${fmt$(teamAP)}</div>
        <div style="font-size:10px;color:var(--d2)">Team AP · Personal: ${fmt$(personalAP)}</div></div>
      </div>
      <div class="team-legs">
        <div style="font-size:10px;font-weight:700;color:var(--g3);letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">Team Members</div>
        <div class="team-member-row" onclick="openProfile('${u.agentId}')">
          <div class="agent-av-sm">${avImg}</div>
          <div style="flex:1"><div style="font-size:12px;font-weight:700;color:var(--t)">${u.agentName} <em style="color:var(--d);font-size:9px">(team lead)</em></div>
          <div style="font-size:10px;color:var(--d2)">${fmt$(personalAP)} AP · ${myD.length} deals</div></div>
          <button class="btn btn-ghost btn-xs" onclick="openAgentRpt('${u.agentId}',event)">Report</button>
        </div>
        ${downUsers.map(du=>{const duD=downD.filter(d=>d.agentId===du.agentId);const avD=du.avatar?`<img src="${du.avatar}" alt="">`:initials(du.agentName);const canView=isAdmin()||myDownIds.includes(du.agentId)||du.agentId===cur.agentId;
          return`<div class="team-member-row" onclick="openProfile('${du.agentId}')"><div class="agent-av-sm">${avD}</div><div style="flex:1"><div style="font-size:12px;font-weight:700;color:var(--t)">${du.agentName}</div><div style="font-size:10px;color:var(--d2)">${fmt$(Store.totalAP(duD))} AP · ${duD.length} deals</div></div>${canView?`<button class="btn btn-ghost btn-xs" onclick="openAgentRpt('${du.agentId}',event)">Report</button>`:''}</div>`;
        }).join('')}
        ${allTeamDeals.length?`<div class="team-deals-section">
          <div style="font-size:10px;font-weight:700;color:var(--g3);letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">Team Deals</div>
          ${allTeamDeals.slice(0,10).map(d=>dealRowHtml(d,true,false)).join('')}
          ${allTeamDeals.length>10?`<div style="text-align:center;padding:8px;font-size:11px;color:var(--d)">+${allTeamDeals.length-10} more</div>`:''}
        </div>`:''}
      </div></div>`;
  });
  if(!viewable.length)html+='<div class="empty">No teams yet. Agents appear here automatically once they have a downline.</div>';
  document.getElementById('teams-body').innerHTML=html;
}
function toggleTeam(id){document.getElementById('tc-'+id)?.classList.toggle('open');}
function openAgentRpt(agentId,e){
  if(e)e.stopPropagation();const u=Store.users.find(x=>x.agentId===agentId);if(!u)return;
  const myD=[...Store.deals.filter(d=>d.agentId===agentId)].sort((a,b)=>new Date(b.date)-new Date(a.date));
  document.getElementById('ar-title').textContent=u.agentName+' — Report';
  document.getElementById('ar-body').innerHTML=`<div class="stat-grid">
    <div class="sc"><div class="sc-label">All Time AP</div><div class="sc-val">${fmt$(Store.totalAP(myD))}</div></div>
    <div class="sc"><div class="sc-label">This Month</div><div class="sc-val wh">${fmt$(Store.totalAP(Store.filterByTF(myD,'month','date')))}</div></div>
    <div class="sc"><div class="sc-label">Total Deals</div><div class="sc-val wh">${myD.length}</div></div>
  </div>${myD.slice(0,20).map(d=>`<div class="deal-row" style="cursor:default"><div class="deal-top"><div><div class="fw7 text-g">${fmtFull(d.ap)} AP</div><div class="deal-meta">${fmtDate(d.date)} · MP ${fmt$(d.mp)} ${d.policyType?'· '+d.policyType:''} ${d.leadType?'· '+d.leadType:''} ${d.referrals?'· '+d.referrals+' refs':''}</div></div></div></div>`).join('')}`;
  openMod('modal-agent-rpt');
}

// ── CONSISTENCY ────────────────────────────────────────────────
function renderConsistency(){
  Store.loadLocal();
  const tf=TF.cons;const now=new Date();let startDate;
  if(tf==='month')startDate=new Date(now.getFullYear(),now.getMonth(),1);
  else if(tf==='ytd')startDate=new Date(now.getFullYear(),0,1);
  else{const allDates=Store.deals.map(d=>new Date(d.date+'T12:00:00'));startDate=allDates.length?new Date(Math.min(...allDates)):new Date(now.getFullYear(),0,1);}
  // Filter: owner/admin see all; agents only see themselves + their registered downlines
  const allAU=Store.getAgentUsers();
  const au=isAdmin()?allAU:allAU.filter(u=>{
    if(u.agentId===cur.agentId)return true;
    if(cur.agentId){const downIds=Store.getDownlineIds(cur.agentId);return downIds.includes(u.agentId);}
    return false;
  });
  let html='';
  au.forEach(u=>{
    const myD=Store.deals.filter(d=>d.agentId===u.agentId&&new Date(d.date+'T12:00:00')>=startDate);
    const dayMap={};myD.forEach(d=>{dayMap[d.date]=(dayMap[d.date]||0)+1;});
    let dayStreak=0;let checkD=new Date(now);
    while(true){const ds=checkD.toISOString().split('T')[0];if(dayMap[ds]){dayStreak++;checkD.setDate(checkD.getDate()-1);}else break;}
    const activeDays=Object.keys(dayMap).length;const totalDays=Math.max(1,Math.ceil((now-startDate)/(24*3600*1000)));const pct=Math.round((activeDays/totalDays)*100);
    const cells=[];for(let i=363;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().split('T')[0];const cnt=dayMap[ds]||0;const cls=cnt===0?'hm-0':cnt===1?'hm-1':cnt<=3?'hm-2':'hm-3';cells.push(`<div style="width:10px;height:10px;border-radius:2px" class="${cls}" title="${ds}: ${cnt} deal${cnt!==1?'s':''}"></div>`);}
    const milestones=[1,2,3,7,14,21,30,60,90];const earned=milestones.filter(m=>dayStreak>=m);
    const avImg=u.avatar?`<img src="${u.avatar}" alt="">`:initials(u.agentName);
    html+=`<div class="card">
      <div class="flsb" style="margin-bottom:10px">
        <div class="fl" style="gap:10px"><div class="agent-av-sm" style="cursor:pointer" onclick="openProfile('${u.agentId}')">${avImg}</div>
          <div><div class="fw7" style="cursor:pointer" onclick="openProfile('${u.agentId}')">${agentBadgeDisplay(u.agentId,null)} ${u.agentName}</div><div class="text-xs text-d">${Store.agN(Store.getMember(u.agentId)?.agency)}</div></div></div>
        <div><div style="font-size:10px;color:var(--d2);margin-bottom:4px">Streak: <strong style="color:var(--g)">${dayStreak}d</strong> · ${activeDays}/${totalDays} days (${pct}%)</div>
          <div>${earned.length?earned.map(m=>`<span class="streak-pill" style="color:var(--g)">&#128293; ${m}d</span>`).join(''):'<span class="streak-pill" style="color:var(--d)">No streak</span>'}</div></div>
      </div>
      <div style="font-size:9px;color:var(--d);margin-bottom:4px">Last 364 days</div>
      <div style="display:grid;grid-template-columns:repeat(52,1fr);gap:2px">${cells.join('')}</div>
    </div>`;
  });
  if(!au.length)html='<div class="empty">No agents found.</div>';
  document.getElementById('consistency-body').innerHTML=html;
}

// ── INCENTIVES ─────────────────────────────────────────────────
function renderIncentives(tab){
  Store.loadLocal();
  const now=new Date().toISOString().split('T')[0];
  // Build tabs for owner
  const tabsEl=document.getElementById('inc-tabs');
  if(tabsEl){
    if(isOwner()){
      tabsEl.innerHTML=`
        <button class="tf-btn ${!tab||tab==='active'?'active':''}" onclick="renderIncentives('active')">Active Incentives</button>
        <button class="tf-btn ${tab==='hidden'?'active':''}" onclick="renderIncentives('hidden')">Hidden Incentives</button>`;
    } else {tabsEl.innerHTML='';}
  }
  // Hidden incentives tab (owner only)
  const hiddenBody=document.getElementById('hidden-inc-body');
  const mainBody=document.getElementById('incentives-body');
  if(tab==='hidden'&&isOwner()){
    if(mainBody)mainBody.style.display='none';
    if(hiddenBody){hiddenBody.style.display='';renderHiddenIncentives(hiddenBody);}
    return;
  }
  if(hiddenBody)hiddenBody.style.display='none';
  if(mainBody)mainBody.style.display='';
  const allInc=Store.incentives.filter(x=>!x.hidden);
  const sorted=[...allInc].sort((a,b)=>new Date(b.startDate||0)-new Date(a.startDate||0));
  if(!sorted.length){document.getElementById('incentives-body').innerHTML=`<div class="empty" style="grid-column:1/-1">No incentives yet.${isOwner()?' Click "+ Add Incentive"':''}</div>`;return;}
  const scopeClasses={agency:'inc-agency',personal:'inc-personal',team:'inc-team'};
  const scopeLabels={agency:'Agency Wide',personal:'Personal',team:'Team'};
  const tfMap={daily:'Daily',weekly:'Weekly',monthly:'Monthly',quarterly:'Quarterly',semiannual:'Semi-Annual',annual:'Annual',lifetime:'Lifetime'};
  const metricLabels={ap:'AP Goal',deals:'Deals Goal',referrals:'Referrals Goal',warmmarket:'Warm Market Goal',days:'Days Active Goal',recruits:'Recruits Goal'};
  let html='';
  sorted.forEach(inc=>{
    const isActive=(!inc.endDate||inc.endDate>=now)&&(!inc.startDate||inc.startDate<=now);
    const goal=parseFloat(inc.goal)||0;const scope=inc.scope||'agency';const metric=inc.metric||'ap';
    // Multi-metric progress
    const allProgress=Store.incProgressAll(inc,cur.agentId);
    const allMet=allProgress.every(p=>p.current>=p.goal||(p.goal===0&&p.current>=0));
    const canRedeem=allMet&&cur.agentId;
    const alreadyEarned=canRedeem&&(cur.badges||[]).some(b=>b.incId===inc.id);
    const progressBars=allProgress.map(p=>{
      const isAP=p.metric==='ap';
      const pct=p.goal>0?Math.min(100,Math.round((p.current/p.goal)*100)):p.current>0?100:0;
      const cur_fmt=isAP?fmtFull(p.current):fmtNum(p.current);
      const goal_fmt=isAP?fmtFull(p.goal):fmtNum(p.goal);
      return`<div style="font-size:10px;color:var(--d2);margin-top:4px">${metricLabels[p.metric]||p.metric}: ${goal_fmt}</div>
        <div class="inc-prog-wrap"><div class="inc-prog-fill" style="width:${pct}%${!isAP?';background:linear-gradient(90deg,#27ae60,#81c784)':''}"></div></div>
        <div style="font-size:10px;color:var(--d2)">${cur_fmt} / ${goal_fmt} — ${pct}%</div>`;
    }).join('');
    html+=`<div class="inc-card ${isActive?'inc-active':''}">
      <div class="inc-emoji">${inc.emoji||'🏆'}</div>
      <div class="fl" style="gap:5px;flex-wrap:wrap">
        <span class="inc-type-tag ${scopeClasses[scope]||'inc-agency'}">${scopeLabels[scope]}</span>
        <span class="inc-type-tag badge-grey">${tfMap[inc.timeframe]||inc.timeframe}</span>
        ${isActive?'<span class="inc-type-tag badge-grn">ACTIVE</span>':''}
      </div>
      <div class="inc-title">${inc.title}</div>
      <div class="inc-reward">&#127942; ${inc.reward}</div>
      ${progressBars}
      ${inc.desc?`<div style="font-size:10px;color:var(--d);line-height:1.5;margin-top:4px">${inc.desc}</div>`:''}
      ${canRedeem&&!alreadyEarned?`<button class="redeem-btn" onclick="redeemInc('${inc.id}')">&#9650; Redeem ${inc.emoji||'🏆'} Badge</button>`:''}
      ${alreadyEarned?`<div style="font-size:10px;color:#81c784;margin-top:4px">&#10003; Badge earned</div>`:''}
      ${isOwner()?`<div class="fl" style="margin-top:8px"><button class="btn btn-ghost btn-xs" onclick="editInc('${inc.id}')">Edit</button><button class="btn btn-dan btn-xs" onclick="delInc('${inc.id}')">Remove</button></div>`:''}
    </div>`;
  });
  document.getElementById('incentives-body').innerHTML=html;
}


function renderHiddenIncentives(container){
  const hidden=Store.incentives.filter(x=>x.hidden);
  if(!hidden.length){container.innerHTML='<div class="empty" style="grid-column:1/-1">No hidden incentives. Create one using "+ Add Incentive" with the Hidden toggle.</div>';return;}
  const now=new Date().toISOString().split('T')[0];
  let html='<div class="incentives-grid">';
  hidden.forEach(inc=>{
    const isActive=(!inc.endDate||inc.endDate>=now)&&(!inc.startDate||inc.startDate<=now);
    html+=`<div class="inc-card ${isActive?'inc-active':''}">
      <div class="inc-emoji">${inc.emoji||'🏆'}</div>
      <div class="fl" style="gap:5px;flex-wrap:wrap">
        <span class="inc-type-tag badge-r">HIDDEN</span>
        <span class="inc-type-tag badge-grey">${inc.timeframe||'lifetime'}</span>
        ${isActive?'<span class="inc-type-tag badge-grn">ACTIVE</span>':''}
      </div>
      <div class="inc-title">${inc.title}</div>
      <div style="font-size:11px;color:var(--d2);line-height:1.6">${inc.desc||''}</div>
      <div style="font-size:10px;color:var(--d);margin-top:4px">Auto-awards ${inc.emoji||'🏆'} ${inc.badgeTitle||inc.title} badge</div>
      <div class="fl" style="margin-top:10px">
        <button class="btn btn-ghost btn-xs" onclick="editInc('${inc.id}')">Edit</button>
        <button class="btn btn-dan btn-xs" onclick="delInc('${inc.id}')">Remove</button>
      </div>
    </div>`;
  });
  html+='</div>';
  container.innerHTML=html;
}

async function redeemInc(incId){
  if(!cur.agentId)return;
  const inc=Store.incentives.find(x=>x.id===incId);if(!inc)return;
  const u=Store.users.find(x=>x.id===cur.id);if(!u)return;
  if(!u.badges)u.badges=[];
  if(u.badges.some(b=>b.incId===incId)){toast('Already earned');return;}
  const badge={id:Store.uid(),incId,emoji:inc.emoji||'🏆',name:inc.badgeTitle||inc.title,earnedAt:new Date().toISOString(),manual:false};
  u.badges.push(badge);cur.badges=u.badges;
  await Store.saveAll();renderIncentives();toast(`${inc.emoji||'🏆'} Badge earned: ${inc.badgeTitle||inc.title}!`);
}

function openAddInc(){
  document.getElementById('inc-modal-ttl').textContent='Add Incentive';
  ['inc-id','inc-title','inc-reward','inc-desc','inc-emoji','inc-badge-title'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('inc-tf').value='monthly';document.getElementById('inc-scope').value='agency';
  document.getElementById('inc-start').value=new Date().toISOString().split('T')[0];document.getElementById('inc-end').value='';
  const hidEl=document.getElementById('inc-hidden');if(hidEl)hidEl.checked=false;
  const hidGrp=document.getElementById('inc-hidden-grp');if(hidGrp)hidGrp.style.display=isOwner()?'':'none';
  _resetMetricRows([{metric:'ap',goal:''}]);
  openMod('modal-inc');
}
function editInc(id){
  const inc=Store.incentives.find(x=>x.id===id);if(!inc)return;
  document.getElementById('inc-modal-ttl').textContent='Edit Incentive';
  document.getElementById('inc-id').value=id;document.getElementById('inc-title').value=inc.title||'';
  document.getElementById('inc-tf').value=inc.timeframe||'monthly';document.getElementById('inc-scope').value=inc.scope||'agency';
  document.getElementById('inc-start').value=inc.startDate||'';document.getElementById('inc-end').value=inc.endDate||'';
  document.getElementById('inc-reward').value=inc.reward||'';document.getElementById('inc-desc').value=inc.desc||'';
  document.getElementById('inc-emoji').value=inc.emoji||'';document.getElementById('inc-badge-title').value=inc.badgeTitle||'';
  const hidEl=document.getElementById('inc-hidden');if(hidEl)hidEl.checked=!!inc.hidden;
  const hidGrp2=document.getElementById('inc-hidden-grp');if(hidGrp2)hidGrp2.style.display=isOwner()?'':'none';
  const metrics=inc.metrics&&inc.metrics.length?inc.metrics:[{metric:inc.metric||'ap',goal:inc.goal||0}];
  _resetMetricRows(metrics);
  openMod('modal-inc');
}

const METRIC_OPTIONS=`
  <option value="ap">AP (Annualized Premium)</option>
  <option value="deals">Deals Submitted</option>
  <option value="referrals">Referrals — Beneficiary</option>
  <option value="allreferrals">Referrals — All (beneficiary + warm market)</option>
  <option value="warmmarket">Warm Market Closes</option>
  <option value="days">Days Posted a Deal</option>
  <option value="recruits">Recruits Added</option>`;

function _metricRowHtml(m,g,idx){
  return`<div class="inc-metric-row" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;background:var(--p2);border:1px solid var(--b);border-radius:7px;padding:8px 10px">
    <div style="flex:1"><label style="font-size:9px;color:var(--d2);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Metric ${idx+1}</label>
    <select class="metric-select" style="background:var(--p2);border:1px solid var(--b);border-radius:6px;padding:6px 10px;color:var(--t);font-size:12px;font-family:Georgia,serif;outline:none;width:100%">${METRIC_OPTIONS}</select></div>
    <div style="width:100px"><label style="font-size:9px;color:var(--d2);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Goal</label>
    <input type="number" class="metric-goal" min="0" value="${g!==undefined?g:''}" placeholder="0" style="background:var(--p2);border:1px solid var(--b);border-radius:6px;padding:6px 10px;color:var(--t);font-size:12px;font-family:Georgia,serif;outline:none;width:100%"></div>
    ${idx>0?`<button type="button" onclick="this.closest('.inc-metric-row').remove()" style="background:var(--rdim);color:#e57373;border:1px solid rgba(192,57,43,.3);border-radius:5px;padding:4px 8px;font-size:10px;cursor:pointer;margin-top:14px">✕</button>`:'<div style="width:28px"></div>'}
  </div>`;
}

function _resetMetricRows(metrics){
  const container=document.getElementById('inc-metrics-container');
  if(!container)return;
  container.innerHTML=metrics.map((m,i)=>_metricRowHtml(m.metric,m.goal,i)).join('');
  // Set select values after render
  const rows=container.querySelectorAll('.inc-metric-row');
  rows.forEach((row,i)=>{const sel=row.querySelector('.metric-select');if(sel&&metrics[i])sel.value=metrics[i].metric||'ap';});
}

function addMetricRow(){
  const container=document.getElementById('inc-metrics-container');
  if(!container)return;
  const idx=container.querySelectorAll('.inc-metric-row').length;
  container.insertAdjacentHTML('beforeend',_metricRowHtml('ap','',idx));
}

async function saveInc(){
  const id=document.getElementById('inc-id').value;
  // Collect all metric rows
  const metricRows=document.querySelectorAll('.inc-metric-row');
  const metrics=[];
  metricRows.forEach(row=>{
    const m=row.querySelector('.metric-select')?.value||'ap';
    const g=row.querySelector('.metric-goal')?.value||'0';
    metrics.push({metric:m,goal:parseFloat(g)||0});
  });
  if(!metrics.length)metrics.push({metric:'ap',goal:0});
  const _hidCb=document.getElementById('inc-hidden');
  const isHidden=_hidCb?_hidCb.checked:false;
  const obj={id:id||Store.uid(),title:document.getElementById('inc-title').value.trim(),timeframe:document.getElementById('inc-tf').value,scope:document.getElementById('inc-scope').value,metrics,metric:metrics[0].metric,goal:metrics[0].goal,startDate:document.getElementById('inc-start').value,endDate:document.getElementById('inc-end').value,reward:document.getElementById('inc-reward').value.trim(),desc:document.getElementById('inc-desc').value.trim(),emoji:document.getElementById('inc-emoji').value.trim(),badgeTitle:document.getElementById('inc-badge-title').value.trim(),hidden:isHidden,createdAt:new Date().toISOString()};
  if(!obj.title){toast('Title required');return;}
  if(id){const idx=Store.incentives.findIndex(x=>x.id===id);if(idx>-1)Store.incentives.splice(idx,1,{...Store.incentives[idx],...obj});}
  else Store.incentives.push(obj);
  await Store.saveAll();closeMod('modal-inc');renderIncentives(isHidden?'hidden':'active');toast('Incentive saved');
}
async function delInc(id){const ok=await showConfirm('Remove Incentive','Remove this incentive?','Remove');if(!ok)return;const idx=Store.incentives.findIndex(x=>x.id===id);if(idx>-1)Store.incentives.splice(idx,1);await Store.saveAll();renderIncentives();toast('Removed');}

// ── MANAGE ─────────────────────────────────────────────────────
function renderManage(){
  if(!isAdmin())return;
  ['users','deals','badges'].forEach(t=>{const el=document.getElementById('manage-'+t+'-div');if(el)el.style.display=t===manageTab?'':'none';});
  if(manageTab==='users')renderManageUsers();
  else if(manageTab==='deals')renderManageDeals();
  else if(manageTab==='badges')renderBadgeFeed();
}

function renderManageUsers(){
  Store.loadLocal();
  // Show ALL CRM members — those with accounts and those without
  const allMembers=Store.crmMembers;
  const registeredIds=Store.users.filter(u=>u.agentId).map(u=>u.agentId);
  let html=`<div class="ct">Portal Accounts</div>`;
  Store.users.filter(u=>u.active!==false).forEach(u=>{
    const m=Store.getMember(u.agentId);const rc={agent:'badge-grn',admin:'badge-g',owner:'rb-owner',manager:'badge-blue'}[u.role]||'badge-grey';
    const av=u.avatar?`<img src="${u.avatar}" alt="">`:initials(u.agentName||u.username);
    const isProtected=['u_jc','u_ty'].includes(u.id);
    html+=`<div class="user-row"><div class="user-row-left"><div class="agent-av-sm">${av}</div>
        <div><div class="fw7">${u.agentName||u.username} <span class="badge ${rc}">${u.role}</span></div>
        <div class="text-xs text-d" style="margin-top:2px">@${u.username}${m?' · '+Store.agN(m.agency):''}${u.commission?' · '+u.commission+'%':''}</div></div></div>
      <div class="user-row-right">
        ${u.agentId?`<button class="btn btn-ghost btn-xs" onclick="openProfile('${u.agentId}',null,'${u.id}')">Profile</button>`:''}
        <button class="btn btn-ghost btn-xs" onclick="openEditUser('${u.id}')">Edit</button>
        ${!isProtected&&(u.role==='agent'||(isOwner()&&u.role==='admin'))?`<button class="btn btn-dan btn-xs" onclick="deactivateUser('${u.id}')">Deactivate</button>`:''}
      </div></div>`;
  });
  // ALL hierarchy members without accounts — the full family tree
  const unregistered=allMembers.filter(m=>!registeredIds.includes(m.id));
  if(unregistered.length){
    html+=`<div class="ct" style="margin-top:16px">Full Hierarchy — No Portal Account</div>`;
    // Group by agency
    const byAgency={};
    unregistered.forEach(m=>{const ag=m.agency||'other';if(!byAgency[ag])byAgency[ag]=[];byAgency[ag].push(m);});
    Object.entries(byAgency).forEach(([ag,members])=>{
      html+=`<div style="font-size:10px;color:var(--g3);letter-spacing:1px;text-transform:uppercase;margin:10px 0 6px;font-weight:700">${Store.agN(ag)}</div>`;
      members.forEach(m=>{
        const upline=Store.getMember(m.uplineId);
        html+=`<div class="user-row"><div class="user-row-left"><div class="agent-av-sm" style="background:var(--p3)">${initials(m.name)}</div>
          <div><div class="fw7" style="color:var(--d2)">${m.name}</div>
          <div class="text-xs text-d">${Store.agN(m.agency)}${upline?' · Under '+upline.name:' · Top level'}</div></div></div>
          <div class="user-row-right"><button class="btn btn-grn btn-xs" onclick="openRegisterUser('${m.id}')">Register Account</button></div>
        </div>`;
      });
    });
  }
  document.getElementById('manage-users-div').innerHTML=html;
}

function renderManageDeals(){
  Store.loadLocal();
  const sorted=[...Store.deals].sort((a,b)=>new Date(b.date)-new Date(a.date));
  let html=`<div class="card"><div class="ct">All Deals (${sorted.length} total)</div>`;
  sorted.forEach(d=>{html+=dealRowHtml(d,false,true);});
  if(!sorted.length)html+='<div class="empty">No deals yet.</div>';
  document.getElementById('manage-deals-div').innerHTML=html+'</div>';
}

// Badge Activity Feed (managers + owner)
function renderBadgeFeed(){
  Store.loadLocal();
  const allBadges=[];
  Store.users.forEach(u=>{
    (u.badges||[]).forEach(b=>{allBadges.push({...b,agentName:u.agentName||u.username,agentId:u.agentId});});
  });
  allBadges.sort((a,b)=>new Date(b.earnedAt)-new Date(a.earnedAt));
  if(!allBadges.length){document.getElementById('manage-badges-div').innerHTML='<div class="empty">No badges earned yet.</div>';return;}
  let html=`<div class="ct">Badge Activity — All Agents</div>`;
  allBadges.forEach(b=>{
    html+=`<div class="badge-feed-item">
      <div class="badge-feed-emoji">${b.emoji||'🏅'}</div>
      <div style="flex:1"><div class="fw7">${b.agentName}</div>
        <div style="font-size:11px;color:var(--g)">${b.name}</div>
        <div class="text-xs text-d">${fmtDate(b.earnedAt?.split('T')[0])} ${b.manual?'· Given by owner':'· Incentive earned'}</div>
      </div>
    </div>`;
  });
  document.getElementById('manage-badges-div').innerHTML=html;
}

// ── REPORTS ────────────────────────────────────────────────────
function renderReports(){
  Store.loadLocal();
  if(isOwner())renderAstroSection();
  _renderMonthlyReportsList();
  const tf=TF.rpt;const cs=document.getElementById('rpt-cs')?.value||null;const ce=document.getElementById('rpt-ce')?.value||null;
  const filt=Store.filterByTF(Store.deals,tf,'date',cs,ce);const lb=Store.buildLB(tf,cs,ce);
  const cRpt=document.getElementById('carrier-report');if(cRpt)cRpt.innerHTML=renderCarrierReport();
  document.getElementById('rpt-preview').innerHTML=`<div class="card"><div class="ct">Preview — ${tfLabel(tf)}</div>
    <div class="stat-grid" style="margin-bottom:12px">
      <div class="sc"><div class="sc-label">Total AP</div><div class="sc-val">${fmt$(Store.totalAP(filt))}</div></div>
      <div class="sc"><div class="sc-label">Deals</div><div class="sc-val wh">${filt.length}</div></div>
      <div class="sc"><div class="sc-label">Active Agents</div><div class="sc-val wh">${lb.filter(r=>r.count>0).length}</div></div>
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rank</th><th>Agent</th><th>AP</th><th>MP</th><th>Deals</th><th>Refs</th></tr></thead><tbody>
      ${lb.map((r,i)=>`<tr><td><div class="rank-badge ${i===0?'r1':i===1?'r2':i===2?'r3':'rn'}">${i+1}</div></td><td><div class="agent-nm">${agentBadgeDisplay(r.agentId,null)} ${r.name}</div><div class="agent-ag">${Store.agN(r.agencyId)}</div></td><td class="ap-cell">${fmt$(r.ap)}</td><td style="color:var(--d2)">${fmt$(r.mp)}</td><td>${r.count}</td><td style="color:var(--d2)">${r.refs||0}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}


function renderCarrierReport(){
  Store.loadLocal();
  const tf=TF.rpt;const cs=document.getElementById('rpt-cs')?.value||null;const ce=document.getElementById('rpt-ce')?.value||null;
  const filt=Store.filterByTF(Store.deals,tf,'date',cs,ce);
  const carriers={};
  filt.forEach(d=>{
    const carrier=d.carrier||'Unknown';
    if(!carriers[carrier])carriers[carrier]={deals:0,ap:0,agents:new Set()};
    carriers[carrier].deals++;
    carriers[carrier].ap+=d.ap||0;
    if(d.agentId)carriers[carrier].agents.add(d.agentId);
  });
  const sorted=Object.entries(carriers).sort((a,b)=>b[1].ap-a[1].ap);
  if(!sorted.length)return'<div class="empty">No carrier data for this period.</div>';
  const maxAP=sorted[0]?.[1]?.ap||1;
  let html=`<div class="card"><div class="ct">Carrier Breakdown — ${tfLabel(tf)}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Carrier</th><th>AP</th><th>Deals</th><th>Agents</th><th>Avg AP</th></tr></thead><tbody>`;
  sorted.forEach(([carrier,d])=>{const pct=Math.round((d.ap/maxAP)*100);html+=`<tr><td class="fw7" style="color:var(--t)">${carrier}</td><td><div class="ap-cell">${fmtFull(d.ap)}</div><div class="bar-wrap"><div class="bar-fill" style="width:${pct}%"></div></div></td><td><span class="badge badge-g">${d.deals}</span></td><td style="color:var(--d2)">${d.agents.size}</td><td style="color:var(--d2)">${d.deals?fmt$(d.ap/d.deals):'—'}</td></tr>`;});
  html+=`</tbody></table></div></div>`;
  return html;
}

function renderAstroSection(){
  const tf=TF.rpt;const filt=Store.filterByTF(Store.deals,tf,'date');
  const ZE={rat:'🐀',ox:'🐂',tiger:'🐯',cat:'🐱',dragon:'🐲',snake:'🐍',horse:'🐴',goat:'🐑',monkey:'🐒',rooster:'🐓',dog:'🐕',pig:'🐷'};
  const bySign={};
  Store.getAgentUsers().forEach(u=>{const m=Store.getMember(u.agentId);if(!m?.dob)return;const sign=m.zodiac||'?';const myAP=Store.totalAP(filt.filter(d=>d.agentId===u.agentId));if(!bySign[sign])bySign[sign]={agents:[],total:0};bySign[sign].agents.push(u.agentName);bySign[sign].total+=myAP;});
  const signData=Object.entries(bySign).sort((a,b)=>b[1].total-a[1].total);
  const pieColors=['#c9a84c','#f0d080','#8a6e30','#b39ddb','#80cbc4','#81c784','#ef9a9a','#60a5fa','#fbbf24','#a5d6a7','#90caf9','#f48fb1'];
  document.getElementById('astro-body').innerHTML=`<div class="chart-wrap pie"><canvas id="chart-astro-pie"></canvas></div>
    <div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Sign</th><th>AP</th><th>Agents</th></tr></thead><tbody>${signData.map(([sign,d])=>`<tr><td><span class="sign-chip">${ZE[sign]||''} ${cap(sign)}</span></td><td class="ap-cell">${fmt$(d.total)}</td><td style="font-size:10px;color:var(--d2)">${d.agents.join(', ')}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">No DOB data</td></tr>'}</tbody></table></div>
    <div class="info-box mt8">&#9670; Owner-only.</div>`;
  setTimeout(()=>{const ctx=document.getElementById('chart-astro-pie')?.getContext('2d');if(!ctx)return;if(charts.astro)charts.astro.destroy();charts.astro=new Chart(ctx,{type:'pie',data:{labels:signData.map(([s])=>`${ZE[s]||''} ${cap(s)}`),datasets:[{data:signData.map(([,d])=>d.total),backgroundColor:pieColors.slice(0,signData.length),borderColor:'#000',borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#9a8f7a',font:{size:11,family:'Georgia,serif'},padding:12}},tooltip:{callbacks:{label:c=>`${c.label}: ${fmtFull(c.raw)}`}}}}});},100);
}

function _getMonthKey(date){const d=date||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function _autoSaveMonthlyReport(){if(!isOwner())return;const key=_getMonthKey();if((Store.monthlyReports||[]).find(r=>r.monthKey===key))return;_buildMonthlyReport(new Date());}
function generateCurrentMonthReport(){_buildMonthlyReport(new Date());toast('Report saved');setTimeout(renderReports,400);}
function _buildMonthlyReport(forDate){
  if(!Store.monthlyReports)Store.monthlyReports=[];
  const key=_getMonthKey(forDate);const yr=forDate.getFullYear();const mo=forDate.getMonth();
  const s=new Date(yr,mo,1);const e=new Date(yr,mo+1,0,23,59,59);
  const monthDeals=Store.deals.filter(d=>{const dd=new Date(d.date+'T12:00:00');return dd>=s&&dd<=e;});
  const au=Store.getAgentUsers();
  const report={monthKey:key,month:MNF[mo]+' '+yr,generatedAt:new Date().toISOString(),totalAP:Store.totalAP(monthDeals),totalDeals:monthDeals.length,activeAgents:au.filter(u=>monthDeals.some(d=>d.agentId===u.agentId)).length,totalAgents:au.length,newSignups:Store.users.filter(u=>u.createdAt&&u.createdAt.startsWith(key)).length,
    agentStats:au.map(u=>{const myD=monthDeals.filter(d=>d.agentId===u.agentId);const dayMap={};myD.forEach(d=>{dayMap[d.date]=(dayMap[d.date]||0)+1;});let streak=0;let chk=new Date(e);while(streak<31){const ds=chk.toISOString().split('T')[0];if(dayMap[ds]){streak++;chk.setDate(chk.getDate()-1);}else break;}
    return{id:u.agentId,name:u.agentName,agency:Store.agN(Store.getMember(u.agentId)?.agency),ap:Store.totalAP(myD),deals:myD.length,activeDays:Object.keys(dayMap).length,streak,refs:myD.reduce((s,d)=>s+(d.referrals||0),0)};}).sort((a,b)=>b.ap-a.ap)};
  const idx=(Store.monthlyReports||[]).findIndex(r=>r.monthKey===key);
  if(idx>-1)Store.monthlyReports.splice(idx,1,report);else{if(!Store.monthlyReports)Store.monthlyReports=[];Store.monthlyReports.push(report);}
  Store.monthlyReports.sort((a,b)=>b.monthKey.localeCompare(a.monthKey));
  Store.saveAll();
}
function _renderMonthlyReportsList(){
  const reports=Store.monthlyReports||[];
  if(!reports.length){document.getElementById('monthly-reports-list').innerHTML='<div class="empty">No reports yet.</div>';return;}
  document.getElementById('monthly-reports-list').innerHTML=reports.map(r=>`<div class="report-card"><div><div style="font-size:15px;font-weight:700;color:var(--g)">${r.month}</div><div style="font-size:11px;color:var(--d2);margin-top:2px">${fmtFull(r.totalAP)} AP · ${r.totalDeals} deals · ${r.activeAgents}/${r.totalAgents} agents</div></div><button class="btn btn-ghost btn-sm" onclick="downloadMonthlyReport('${r.monthKey}')">&#8681; Download</button></div>`).join('');
}
function downloadMonthlyReport(monthKey){
  const r=(Store.monthlyReports||[]).find(x=>x.monthKey===monthKey);if(!r){toast('Not found');return;}
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cornerstone ${r.month}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,serif;background:#fff;color:#111;padding:32px}h1{font-size:24px;color:#c9a84c;margin-bottom:4px}h2{font-size:13px;color:#8a6e30;margin-bottom:20px;font-weight:400}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}.box{border:1px solid #e0d0a0;border-radius:8px;padding:12px;text-align:center}.val{font-size:24px;font-weight:700;color:#c9a84c}.lbl{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:12px}th{padding:9px 12px;text-align:left;font-size:9px;color:#8a6e30;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid #e0d0a0}td{padding:9px 12px;border-bottom:1px solid #f5f0e8;color:#444}tr:nth-child(even)td{background:#fdfaf4}.gold{color:#c9a84c;font-weight:700}.footer{margin-top:28px;font-size:10px;color:#bbb;border-top:1px solid #e0d0a0;padding-top:12px;text-align:center}</style></head><body>
  <h1>Cornerstone Council</h1><h2>${r.month} — Monthly Production Report</h2>
  <div class="grid"><div class="box"><div class="val gold">$${fmtNum(r.totalAP)}</div><div class="lbl">Total AP</div></div><div class="box"><div class="val">${r.totalDeals}</div><div class="lbl">Deals</div></div><div class="box"><div class="val">${r.activeAgents}/${r.totalAgents}</div><div class="lbl">Writing Agents</div></div><div class="box"><div class="val">${r.newSignups||0}</div><div class="lbl">New Signups</div></div></div>
  <table><thead><tr><th>Rank</th><th>Agent</th><th>Agency</th><th>AP</th><th>Deals</th><th>Active Days</th><th>Streak</th><th>Refs</th></tr></thead><tbody>
  ${r.agentStats.map((a,i)=>`<tr><td>${i+1}</td><td>${a.name}</td><td>${a.agency}</td><td class="gold">$${fmtNum(a.ap)}</td><td>${a.deals}</td><td>${a.activeDays}</td><td>${a.streak}d</td><td>${a.refs||0}</td></tr>`).join('')}
  </tbody></table><div class="footer">Cornerstone Council · ${r.month}</div></body></html>`;
  const blob=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Cornerstone_${r.monthKey}_Report.html`;a.click();
  toast(`${r.month} downloaded`);
}

// ── PROFILE MODAL ──────────────────────────────────────────────
let _profileAgentId=null,_profileUserId=null;
function openProfile(agentId,e,fallbackUserId){
  if(e&&e.stopPropagation)e.stopPropagation();
  Store.loadLocal();
  _profileAgentId=agentId||null;
  let u=null;
  if(agentId&&agentId!=='null'&&agentId!=='undefined'){
    u=Store.users.find(x=>x.agentId===agentId);
  }
  if(!u&&fallbackUserId&&fallbackUserId!=='null'&&fallbackUserId!=='undefined'){
    u=Store.users.find(x=>x.id===fallbackUserId);
  }
  _profileUserId=u?.id||null;
  if(!u){toast('Profile not found');return;}
  _renderProfile(u);openMod('modal-profile');
}
function openOwnProfile(){if(cur)openProfile(cur.agentId,null,cur.id);}

function _renderProfile(u){
  const m=u.agentId?Store.getMember(u.agentId):null;
  const isOwnProfile=u.id===cur?.id;
  const myDeals=[...Store.deals.filter(d=>d.agentId===u.agentId)].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const avImg=u.avatar?`<img src="${u.avatar}" alt="">`:initials(u.agentName||u.username);
  const socialFields=[
    {key:'instagram',label:'Instagram'},{key:'linkedin',label:'LinkedIn'},
    {key:'facebook',label:'Facebook'},{key:'tiktok',label:'TikTok'},
    {key:'discord',label:'Discord'},{key:'website',label:'Website'},
  ];
  const links=socialFields.filter(s=>u.links?.[s.key]).map(s=>{let href=u.links[s.key];if(s.key!=='discord'&&!/^https?:\/\//i.test(href))href='https://'+href;return`<a href="${s.key==='discord'?'#':href}" target="${s.key==='discord'?'_self':'_blank'}" rel="noopener" class="social-link">${s.label}</a>`;}).join('');
  const wornSlots=(u.wornBadges||[u.wornBadgeId||'','','']).slice(0,3);
  const wornBadges=wornSlots.map(id=>(u.badges||[]).find(b=>b.id===id)).filter(Boolean);
  document.getElementById('profile-modal-title').textContent=u.agentName||u.username;
  const tabs=[{id:'deals',label:'Deals'},{id:'badges',label:`Badges${(u.badges||[]).length?' ('+u.badges.length+')':''}`},...(isOwnProfile?[{id:'edit',label:'Edit Profile'},{id:'settings',label:'Settings'}]:[])];
  let html=`<div class="profile-hero">
    <div class="profile-av-lg" ${isOwnProfile?'onclick="triggerAvatarUpload()"':''}>
      ${avImg}${isOwnProfile?`<div class="av-upload-overlay">Change</div><input type="file" id="avatar-file" accept="image/*" style="display:none" onchange="handleAvatarUpload(event)">`:''}</div>
    <div class="profile-hero-info">
      <div class="profile-name-big">${u.agentName||u.username} ${wornBadges.map(b=>`<span title="${b.name}" style="font-size:18px">${b.emoji||'🏅'}</span>`).join('')}</div>
      <div class="profile-role-line">${Store.agN(m?.agency)} <span class="badge badge-g">${u.role}</span></div>
      <div class="profile-join-line">Joined: ${isOwner()?`<input type="date" value="${u.joinDate||''}" style="background:var(--p2);border:1px solid var(--b);border-radius:4px;padding:2px 8px;color:var(--g);font-size:11px;font-family:Georgia,serif;outline:none" onchange="saveJoinDate('${u.id}',this.value)">`:u.joinDate?fmtDate(u.joinDate):'Not set'}</div>
      ${u.bio?`<div style="font-size:11px;color:var(--d2);line-height:1.6;margin-top:6px">${u.bio}</div>`:''}
      ${links?`<div class="profile-social-links" style="margin-top:8px">${links}</div>`:''}
    </div>
  </div>
  <div class="profile-stats-grid">
    <div class="sc"><div class="sc-label">All Time AP</div><div class="sc-val">${fmt$(Store.totalAP(myDeals))}</div></div>
    <div class="sc"><div class="sc-label">This Month</div><div class="sc-val wh">${fmt$(Store.totalAP(Store.filterByTF(myDeals,'month','date')))}</div></div>
    <div class="sc"><div class="sc-label">Total Deals</div><div class="sc-val wh">${myDeals.length}</div></div>
  </div>
  <div class="profile-tabs">${tabs.map(t=>`<button class="tab${t.id==='deals'?' active':''}" onclick="_profileTab('${t.id}',this)">${t.label}</button>`).join('')}</div>
  <div id="pt-deals">${myDeals.length?myDeals.map(d=>`<div class="deal-row clickable" onclick="this.classList.toggle('expanded')"><div class="deal-top"><div><div class="fw7 text-g">${fmtFull(d.ap)} AP</div><div class="deal-meta">${fmtDate(d.date)} · MP ${fmt$(d.mp)}${d.policyType?' · '+d.policyType:''}${d.leadType?' · '+d.leadType:''}${d.referrals?' · '+d.referrals+' refs':''}</div></div></div><div class="deal-notes-body">${d.notes||'<em style="color:var(--d)">No notes.</em>'}</div></div>`).join(''):'<div class="empty">No deals posted.</div>'}</div>
  <div id="pt-badges" style="display:none">
    ${isOwner()&&u.agentId?`<div class="fl" style="margin-bottom:12px"><button class="btn btn-ghost btn-sm" onclick="openGiveBadge('${u.agentId}')">+ Give Badge</button></div>`:''}
    ${(u.badges||[]).length?`<div class="badge-grid">${(u.badges||[]).map(b=>`<div class="earned-badge">
      <span class="b-emoji">${b.emoji||'🏅'}</span>
      <div class="b-name">${b.name}</div>
      <div class="b-date">${fmtDate(b.earnedAt?.split('T')[0])}</div>
      ${isOwnProfile?`<div style="display:flex;gap:4px;margin-top:6px">
      ${[0,1,2].map(slot=>{
        const slots=(u.wornBadges||['','','']).slice(0,3);
        const inSlot=slots[slot]===b.id;
        return`<button style="flex:1;font-size:8px;padding:2px 4px;border-radius:4px;border:1px solid var(--b);background:${inSlot?'var(--g)':'var(--g4)'};color:${inSlot?'#000':'var(--g3)'};cursor:pointer;font-family:Georgia,serif" onclick="setWornSlot('${u.id}','${b.id}',${slot})">${inSlot?'✓ Slot '+(slot+1):'Slot '+(slot+1)}</button>`;
      }).join('')}
    </div>`:''}
      ${isOwner()?`<button class="btn btn-dan btn-xs" style="margin-top:4px;width:100%" onclick="removeBadge('${u.id}','${b.id}')">Remove</button>`:''}
    </div>`).join('')}</div>`:'<div class="empty">No badges yet.</div>'}
  </div>
  ${isOwnProfile?`<div id="pt-settings" style="display:none">
    <div class="fg"><label>Change Username</label><input type="text" id="sett-username" value="${u.username||''}"></div>
    <div class="fg"><label>New Password (leave blank to keep current)</label><input type="text" id="sett-password" placeholder="New password..."></div>
    <div id="sett-err" class="warn-box mt8" style="display:none"></div>
    <button class="btn btn-pri" onclick="saveSettings('${u.id}')">Save Settings</button>
  </div>
  <div id="pt-edit" style="display:none">
    <div class="fg"><label>Bio</label><textarea id="prof-bio" rows="4" placeholder="Write a short bio...">${u.bio||''}</textarea></div>
    ${socialFields.map(s=>`<div class="fg"><label>${s.label}</label><input type="${s.key==='discord'?'text':'url'}" id="prof-${s.key}" value="${u.links?.[s.key]||''}" placeholder="${s.key==='discord'?'Username or server link':'https://...'}"></div>`).join('')}
    <button class="btn btn-pri" onclick="saveProfileEdits('${u.id}')">Save Profile</button>
  </div>`:''}`;
  document.getElementById('profile-modal-body').innerHTML=html;
}

function _profileTab(tab,btn){document.querySelectorAll('#profile-modal-body .tab').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');['deals','badges','edit','settings'].forEach(t=>{const el=document.getElementById('pt-'+t);if(el)el.style.display=t===tab?'':'none';});}
function triggerAvatarUpload(){document.getElementById('avatar-file')?.click();}
function handleAvatarUpload(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=async ev=>{const u=Store.users.find(x=>x.id===_profileUserId);if(!u)return;u.avatar=ev.target.result;if(cur.id===_profileUserId){_setHdrAvatar(cur);cur.avatar=u.avatar;}await Store.saveAll();toast('Photo updated');_renderProfile(u);};reader.readAsDataURL(file);}
async function saveProfileEdits(uid){
  const u=Store.users.find(x=>x.id===uid);if(!u)return;
  u.bio=document.getElementById('prof-bio')?.value||'';

  const socialKeys=['instagram','linkedin','facebook','tiktok','discord','website'];
  u.links={};socialKeys.forEach(k=>{const el=document.getElementById('prof-'+k);if(el)u.links[k]=el.value||'';});
  await Store.saveAll();toast('Profile saved');_renderProfile(u);
}
async function saveJoinDate(uid,val){const u=Store.users.find(x=>x.id===uid);if(!u)return;u.joinDate=val;await Store.saveAll();toast('Join date saved');}
async function setWornSlot(userId,badgeId,slot){
  const u=Store.users.find(x=>x.id===userId);if(!u)return;
  if(!u.wornBadges)u.wornBadges=['','',''];
  // If already in this slot — remove it
  if(u.wornBadges[slot]===badgeId){u.wornBadges[slot]='';}
  else{
    // Remove from any other slot first
    u.wornBadges=u.wornBadges.map(id=>id===badgeId?'':id);
    u.wornBadges[slot]=badgeId;
  }
  u.wornBadgeId=u.wornBadges[0]||null; // backward compat
  if(cur.id===userId){cur.wornBadges=[...u.wornBadges];cur.wornBadgeId=u.wornBadgeId;_updateWornBadge();}
  await Store.saveAll();_renderProfile(u);
  const filled=u.wornBadges.filter(x=>x).length;
  toast(filled?`${filled} badge${filled>1?'s':''} worn`:'Badges cleared');
}
function openGiveBadge(agentId){document.getElementById('gb-agent-id').value=agentId;document.getElementById('gb-emoji').value='';document.getElementById('gb-name').value='';document.getElementById('gb-note').value='';openMod('modal-give-badge');}

async function saveSettings(uid){
  const u=Store.users.find(x=>x.id===uid);if(!u)return;
  const newUser=document.getElementById('sett-username')?.value?.trim();
  const newPwd=document.getElementById('sett-password')?.value?.trim();
  const errEl=document.getElementById('sett-err');if(errEl)errEl.style.display='none';
  if(!newUser){if(errEl){errEl.textContent='Username cannot be empty.';errEl.style.display='block';}return;}
  // Check duplicate username
  const duplicate=Store.users.find(x=>x.username.toLowerCase()===newUser.toLowerCase()&&x.id!==uid);
  if(duplicate){if(errEl){errEl.textContent='That username is already taken.';errEl.style.display='block';}return;}
  u.username=newUser;
  if(newPwd)u.pwd=newPwd;
  if(cur.id===uid){cur.username=newUser;if(newPwd)cur.pwd=newPwd;}
  await Store.saveAll();
  toast('Settings saved');
  _renderProfile(u);
}

async function giveBadge(){
  const agentId=document.getElementById('gb-agent-id').value;const emoji=document.getElementById('gb-emoji').value.trim();const name=document.getElementById('gb-name').value.trim();
  if(!name){toast('Badge name required');return;}const u=Store.users.find(x=>x.agentId===agentId);if(!u)return;
  if(!u.badges)u.badges=[];u.badges.push({id:Store.uid(),emoji,name,note:document.getElementById('gb-note').value.trim(),earnedAt:new Date().toISOString(),manual:true});
  await Store.saveAll();closeMod('modal-give-badge');toast(`${emoji} Badge given to ${u.agentName}`);const pU=Store.users.find(x=>x.agentId===agentId);if(pU)_renderProfile(pU);
}
async function removeBadge(userId,badgeId){const ok=await showConfirm('Remove Badge','Remove this badge?','Remove');if(!ok)return;const u=Store.users.find(x=>x.id===userId);if(!u)return;u.badges=(u.badges||[]).filter(b=>b.id!==badgeId);if(u.wornBadgeId===badgeId)u.wornBadgeId=null;if(cur.id===userId){cur.badges=u.badges;cur.wornBadgeId=u.wornBadgeId;_updateWornBadge();}await Store.saveAll();_renderProfile(u);toast('Badge removed');}


// ── PERSONAL GOALS ─────────────────────────────────────────────
const GOAL_METRIC_LABELS={ap:'AP',deals:'Deals',referrals:'Referrals',warmmarket:'Warm Market',days:'Days Active'};
const GOAL_PERIOD_LABELS={none:'Ongoing',daily:'Daily',weekly:'Weekly',monthly:'Monthly',yearly:'Yearly'};

function renderPersonalGoals(){
  const card=document.getElementById('personal-goals-card');
  const list=document.getElementById('personal-goals-list');
  if(!card||!list)return;
  if(!cur.agentId){card.style.display='none';return;}
  card.style.display='';
  const myGoals=Store.personalGoals.filter(g=>g.agentId===cur.agentId);
  if(!myGoals.length){list.innerHTML='<div class="empty" style="padding:16px">No personal goals set. Add one to track your own standards.</div>';return;}
  list.innerHTML=myGoals.map(g=>{
    const current=Store.goalProgress(g,cur.agentId);
    const target=parseFloat(g.target)||1;
    const pct=Math.min(100,Math.round((current/target)*100));
    const isAP=g.metric==='ap';
    const curFmt=isAP?fmtFull(current):fmtNum(current);
    const tgtFmt=isAP?fmtFull(target):fmtNum(target);
    const done=pct>=100;
    return`<div style="margin-bottom:12px">
      <div class="flsb" style="margin-bottom:4px">
        <div>
          <span class="fw7" style="font-size:13px;color:${done?'#81c784':'var(--t)'}">${g.name}</span>
          ${done?'<span style="font-size:12px;margin-left:6px">✓</span>':''}
          <span class="badge badge-grey" style="font-size:8px;margin-left:6px">${GOAL_PERIOD_LABELS[g.period]||g.period}</span>
        </div>
        <div class="fl" style="gap:6px">
          <span style="font-size:11px;color:var(--d2)">${curFmt} / ${tgtFmt}</span>
          <button class="btn btn-ghost btn-xs" onclick="editGoal('${g.id}')">Edit</button>
          <button class="btn btn-dan btn-xs" onclick="deleteGoal('${g.id}')">✕</button>
        </div>
      </div>
      <div style="height:8px;background:var(--b);border-radius:4px;overflow:hidden">
        <div style="height:100%;border-radius:4px;width:${pct}%;background:${done?'linear-gradient(90deg,#27ae60,#81c784)':'linear-gradient(90deg,var(--g3),var(--g))'};transition:width .5s"></div>
      </div>
      <div style="font-size:9px;color:var(--d);margin-top:2px">${GOAL_METRIC_LABELS[g.metric]||g.metric} · ${pct}%</div>
    </div>`;
  }).join('');
}

function openAddGoal(){
  document.getElementById('goal-modal-ttl').textContent='Add Personal Goal';
  document.getElementById('goal-id').value='';
  document.getElementById('goal-name').value='';
  document.getElementById('goal-metric').value='ap';
  document.getElementById('goal-target').value='';
  document.getElementById('goal-period').value='none';
  openMod('modal-goal');
}
function editGoal(id){
  const g=Store.personalGoals.find(x=>x.id===id);if(!g)return;
  document.getElementById('goal-modal-ttl').textContent='Edit Goal';
  document.getElementById('goal-id').value=id;
  document.getElementById('goal-name').value=g.name||'';
  document.getElementById('goal-metric').value=g.metric||'ap';
  document.getElementById('goal-target').value=g.target||'';
  document.getElementById('goal-period').value=g.period||'none';
  openMod('modal-goal');
}
async function saveGoal(){
  const id=document.getElementById('goal-id').value;
  const name=document.getElementById('goal-name').value.trim();
  if(!name){toast('Goal name required');return;}
  if(!cur.agentId){toast('You need an agent account to set personal goals');return;}
  const target=parseFloat(document.getElementById('goal-target').value)||0;
  if(!target){toast('Please enter a target number');return;}
  const obj={
    id:id||Store.uid(),
    agentId:cur.agentId,
    name,
    metric:document.getElementById('goal-metric').value||'ap',
    target,
    period:document.getElementById('goal-period').value||'none',
    createdAt:new Date().toISOString()
  };
  if(id){
    const idx=Store.personalGoals.findIndex(x=>x.id===id);
    if(idx>-1)Store.personalGoals.splice(idx,1,obj);
    else Store.personalGoals.push(obj);
  } else {
    Store.personalGoals.push(obj);
  }
  await Store.saveAll();
  closeMod('modal-goal');
  renderPersonalGoals();
  toast('Goal saved — '+name);
}
async function deleteGoal(id){
  const ok=await showConfirm('Remove Goal','Remove this personal goal?','Remove');if(!ok)return;
  const idx=Store.personalGoals.findIndex(x=>x.id===id);if(idx>-1)Store.personalGoals.splice(idx,1);
  await Store.saveAll();renderPersonalGoals();toast('Goal removed');
}


// ── CHARGEBACKS & PERSISTENCY ──────────────────────────────────
function renderChargebackSection(){
  if(!cur.agentId)return;
  const card=document.getElementById('chargeback-card');if(!card)return;
  card.style.display='';
  // Persistency pies
  const months=[2,6,9,12];
  const pieCont=document.getElementById('persistency-charts');
  if(pieCont){
    pieCont.innerHTML=months.map(m=>{
      const score=Store.persistencyScore(cur.agentId,m);
      if(score===null)return`<div class="persist-card"><div class="persist-label">${m}-Month</div><div style="font-size:12px;color:var(--d);margin-top:8px">Not enough data</div></div>`;
      const cls=score>=85?'good':score>=70?'warn':'bad';
      const r=36,circ=2*Math.PI*r,dash=circ*(score/100),gap=circ-dash;
      return`<div class="persist-card">
        <div class="persist-pie">
          <svg width="90" height="90" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="${r}" fill="none" stroke="rgba(201,168,76,0.12)" stroke-width="10"/>
            <circle cx="45" cy="45" r="${r}" fill="none" stroke="${score>=85?'#81c784':score>=70?'#fbbf24':'#e57373'}" stroke-width="10" stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:15px;font-weight:700;color:${score>=85?'#81c784':score>=70?'#fbbf24':'#e57373'}">${score}%</div>
        </div>
        <div class="persist-label">${m === 12 ? '1-Year' : m+'-Month'} Persistency</div>
      </div>`;
    }).join('');
  }
  // Chargeback list
  const myCBs=[...Store.chargebacks.filter(cb=>cb.agentId===cur.agentId)].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const cbList=document.getElementById('chargeback-list');
  if(cbList){
    cbList.innerHTML=myCBs.length?`<div class="ct" style="margin-top:12px">Chargeback History</div>`+myCBs.map(cb=>`<div class="cb-row">
      <div class="flsb"><div><div class="fw7 text-rd">${fmtFull(cb.mp*12)} AP Lost</div>
      <div class="deal-meta">${fmtDate(cb.date)} · ${cb.policyType||''} ${cb.carrier?'· '+cb.carrier:''}</div>
      ${cb.notes?`<div style="font-size:11px;color:var(--d);margin-top:3px">${cb.notes}</div>`:''}</div>
      <button class="btn btn-dan btn-xs" onclick="delChargeback('${cb.id}')">Remove</button></div>
    </div>`).join(''):'<div class="text-xs text-d" style="margin-top:8px;padding:8px">No chargebacks recorded.</div>';
  }
}

function openChargeback(){
  document.getElementById('cb-id').value='';
  document.getElementById('cb-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('cb-ptype').value='';
  document.getElementById('cb-carrier').value='';
  document.getElementById('cb-mp').value='';
  document.getElementById('cb-notes').value='';
  openMod('modal-chargeback');
}

async function submitChargeback(){
  const mp=parseFloat(document.getElementById('cb-mp').value)||0;
  const date=document.getElementById('cb-date').value;
  if(!date){toast('Date required');return;}
  if(!cur.agentId){toast('Not linked to agent account');return;}
  Store.chargebacks.push({
    id:Store.uid(),agentId:cur.agentId,agentName:cur.agentName,
    date,mp,policyType:document.getElementById('cb-ptype').value,
    carrier:document.getElementById('cb-carrier').value,
    notes:document.getElementById('cb-notes').value.trim(),
    createdAt:new Date().toISOString()
  });
  await Store.saveAll();closeMod('modal-chargeback');renderChargebackSection();toast('Chargeback recorded');
}

async function delChargeback(id){
  const ok=await showConfirm('Remove Chargeback','Remove this chargeback?','Remove');if(!ok)return;
  const idx=Store.chargebacks.findIndex(x=>x.id===id);if(idx>-1)Store.chargebacks.splice(idx,1);
  await Store.saveAll();renderChargebackSection();toast('Removed');
}

// ── RECRUIT POSTS ──────────────────────────────────────────────
function renderRecruitPosts(){
  if(!cur.agentId)return;
  const myPosts=Store.recruitPosts.filter(p=>canSeeRecruitPosts(p.agentId)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const myAgentPosts=myPosts.filter(p=>p.agentId===cur.agentId);
  const el=document.getElementById('recruit-posts-list');if(!el)return;
  el.innerHTML=myAgentPosts.length?myAgentPosts.map(p=>`<div class="recruit-post">
    <div class="recruit-post-hdr"><div class="fw7">${p.recruitName}</div><div class="fl"><div class="text-xs text-d">${fmtDate(p.date)}</div><button class="btn btn-dan btn-xs" onclick="delRecruitPost('${p.id}')">Remove</button></div></div>
    ${p.notes?`<div class="text-sm text-d" style="margin-top:4px">${p.notes}</div>`:''}
  </div>`).join(''):'<div class="empty">No recruit posts yet.</div>';
}
function openAddRecruitPost(){document.getElementById('rp-name').value='';document.getElementById('rp-notes').value='';openMod('modal-recruit-post');}
async function submitRecruitPost(){
  const name=document.getElementById('rp-name').value.trim();if(!name){toast('Recruit name required');return;}
  Store.recruitPosts.push({id:Store.uid(),agentId:cur.agentId,agentName:cur.agentName,recruitName:name,notes:document.getElementById('rp-notes').value.trim(),date:new Date().toISOString().split('T')[0],createdAt:new Date().toISOString()});
  await Store.saveAll();closeMod('modal-recruit-post');renderRecruitPosts();toast('Recruit post added');
}
async function delRecruitPost(id){const ok=await showConfirm('Remove Post','Remove this recruit post?','Remove');if(!ok)return;const idx=Store.recruitPosts.findIndex(x=>x.id===id);if(idx>-1)Store.recruitPosts.splice(idx,1);await Store.saveAll();renderRecruitPosts();toast('Removed');}

// ── DEAL MANAGEMENT ────────────────────────────────────────────
function dealRowHtml(d,showAgent,adminEdit){
  const canEdit=adminEdit||isOwner()||(d.agentId===cur?.agentId);
  const u=Store.users.find(x=>x.agentId===d.agentId);
  const avImg=u?.avatar?`<img src="${u.avatar}" alt="">`:initials(u?.agentName||'');
  return`<div class="deal-row clickable" id="dr-${d.id}" onclick="toggleDeal('${d.id}')">
    <div class="deal-top">
      <div style="flex:1;min-width:0">
        <div class="fl" style="gap:7px;flex-wrap:wrap">
          <div class="fw7 text-g" style="font-size:13px">${fmtFull(d.ap)} AP</div>
          ${showAgent&&u?`<span class="fl" style="gap:4px;cursor:pointer" onclick="openProfile('${d.agentId}',event)"><span class="agent-av-sm" style="width:18px;height:18px;font-size:8px">${avImg}</span>${agentBadgeDisplay(d.agentId,d.date)}<span style="font-size:10px;color:var(--d2)">${u.agentName}</span></span>`:''}
          ${d.policyType?`<span class="badge badge-g">${d.policyType}</span>`:''}
          ${d.leadType?`<span class="badge badge-grey">${d.leadType}</span>`:''}
          ${d.referrals?`<span class="badge badge-blue">${d.referrals} refs</span>`:''}
        </div>
        <div class="deal-meta">${fmtDate(d.date)} · MP ${fmt$(d.mp)}${d.carrier?' · '+d.carrier:''}${d.leadSource?' · '+d.leadSource:''}${d.eftDate?' · EFT '+d.eftDate:''}${d.notes?' · <span style="color:var(--g3)">&#8659; notes</span>':''}</div>
      </div>
      <div class="fl" style="flex-shrink:0">
        ${canEdit?`<button class="btn btn-ghost btn-xs" onclick="openEditDeal('${d.id}',event)">Edit</button><button class="btn btn-dan btn-xs" onclick="delDeal('${d.id}',event)">Remove</button>`:''}
      </div>
    </div>
    <div class="deal-notes-body">${d.notes?`<div style="margin-bottom:8px">${d.notes}</div>`:''}
      <em style="color:var(--d);display:${d.notes?'none':'inline'}">No notes.</em>
      ${showAgent&&u?`<button class="btn btn-ghost btn-xs" onclick="openProfile('${d.agentId}',event)" style="margin-top:6px">View ${u.agentName}'s Profile</button>`:''}
    </div>
  </div>`;
}
function toggleDeal(id){document.getElementById('dr-'+id)?.classList.toggle('expanded');}

function openPostDeal(){
  document.getElementById('deal-modal-ttl').textContent='Submit Deal';
  document.getElementById('pd-id').value='';document.getElementById('pd-mp').value='';document.getElementById('pd-ap-show').value='';
  document.getElementById('pd-carrier').value='';document.getElementById('pd-ptype').value='';
  document.getElementById('pd-leadtype').value='';document.getElementById('pd-refs').value='0';
  const ls=document.getElementById('pd-leadsource');if(ls)ls.value='';
  const eft=document.getElementById('pd-eft');if(eft)eft.value='';
  document.getElementById('pd-notes').value='';
  // Hide dashboard from owner
  const dashTab=Array.from(document.querySelectorAll('.tab')).find(t=>(t.getAttribute('onclick')||'').includes("'dashboard'"));
  if(dashTab)dashTab.style.display=isOwner()?'none':'';
  document.getElementById('pd-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('deal-err').style.display='none';openMod('modal-deal');
}
function openEditDeal(id,e){if(e)e.stopPropagation();const d=Store.deals.find(x=>x.id===id);if(!d)return;
  if(!isAdmin()&&!isOwner()&&d.agentId!==cur.agentId){toast('You can only edit your own deals.');return;}
  document.getElementById('deal-modal-ttl').textContent='Edit Deal';document.getElementById('pd-id').value=id;
  document.getElementById('pd-date').value=d.date;document.getElementById('pd-mp').value=d.mp;
  document.getElementById('pd-ap-show').value='$'+d.ap.toFixed(2)+' AP';
  document.getElementById('pd-carrier').value=d.carrier||'';document.getElementById('pd-ptype').value=d.policyType||'';
  document.getElementById('pd-leadtype').value=d.leadType||'';document.getElementById('pd-refs').value=d.referrals||0;
  const lsE=document.getElementById('pd-leadsource');if(lsE)lsE.value=d.leadSource||'';
  const eftE=document.getElementById('pd-eft');if(eftE)eftE.value=d.eftDate||'';
  document.getElementById('pd-notes').value=d.notes||'';document.getElementById('deal-err').style.display='none';openMod('modal-deal');
}
function calcAP(){const mp=parseFloat(document.getElementById('pd-mp').value)||0;document.getElementById('pd-ap-show').value=mp>0?'$'+(mp*12).toFixed(2)+' AP':'';}
async function submitDeal(){
  const mp=parseFloat(document.getElementById('pd-mp').value);const date=document.getElementById('pd-date').value;
  const errEl=document.getElementById('deal-err');errEl.style.display='none';
  if(!mp||mp<=0){errEl.textContent='Please enter a valid monthly premium.';errEl.style.display='block';return;}
  if(!date){errEl.textContent='Please select a date.';errEl.style.display='block';return;}
  if(!cur.agentId){errEl.textContent='Not linked to an agent account.';errEl.style.display='block';return;}
  const leadType=document.getElementById('pd-leadtype').value;
  const leadSource=document.getElementById('pd-leadsource')?.value?.trim()||'';
  const eftDate=document.getElementById('pd-eft')?.value?.trim()||'';
  const referrals=parseInt(document.getElementById('pd-refs').value)||0;
  const id=document.getElementById('pd-id').value;
  if(id){const d=Store.deals.find(x=>x.id===id);if(d){d.date=date;d.mp=parseFloat(mp.toFixed(2));d.ap=parseFloat((mp*12).toFixed(2));d.carrier=document.getElementById('pd-carrier').value.trim();d.policyType=document.getElementById('pd-ptype').value;d.leadType=leadType;d.leadSource=leadSource;d.eftDate=eftDate;d.referrals=referrals;d.notes=document.getElementById('pd-notes').value.trim();d.editedAt=new Date().toISOString();}}
  else{Store.deals.push({id:Store.uid(),agentId:cur.agentId,agentName:cur.agentName,agencyId:cur.agencyId,date,mp:parseFloat(mp.toFixed(2)),ap:parseFloat((mp*12).toFixed(2)),carrier:document.getElementById('pd-carrier').value.trim(),policyType:document.getElementById('pd-ptype').value,leadType,leadSource,eftDate,referrals,notes:document.getElementById('pd-notes').value.trim(),createdAt:new Date().toISOString(),editedAt:null});}
  await Store.saveAll();closeMod('modal-deal');toast((id?'Updated':'Submitted')+' — '+fmtFull(mp*12)+' AP');refresh();
}
async function delDeal(id,e){if(e)e.stopPropagation();const d=Store.deals.find(x=>x.id===id);if(!d)return;
  if(!isOwner()&&!isAdmin()&&d.agentId!==cur.agentId){toast('You can only remove your own deals.');return;}
  const ok=await showConfirm('Remove Deal','Remove this deal? Ctrl+Z to undo.','Remove');if(!ok)return;
  const idx=Store.deals.findIndex(x=>x.id===id);if(idx>-1)Store.deals.splice(idx,1);
  await Store.saveAll();toast('Removed — Ctrl+Z to undo');refresh();}

// ── LEAD SPEND ─────────────────────────────────────────────────
function openLeadSpend(){document.getElementById('sp-week').value=Store.getMondayOf(new Date().toISOString().split('T')[0]);document.getElementById('sp-amount').value='';document.getElementById('sp-notes').value='';openMod('modal-spend');}
async function submitSpend(){const amount=parseFloat(document.getElementById('sp-amount').value);const weekOf=document.getElementById('sp-week').value;if(!amount||amount<=0){toast('Enter a valid amount');return;}if(!cur.agentId){toast('Not linked to agent account');return;}Store.spend.push({id:Store.uid(),agentId:cur.agentId,agentName:cur.agentName,weekOf,amount:parseFloat(amount.toFixed(2)),notes:document.getElementById('sp-notes').value.trim(),createdAt:new Date().toISOString()});await Store.saveAll();closeMod('modal-spend');toast('Lead spend recorded — '+fmt$(amount));refresh();}
async function delSpend(id,e){if(e)e.stopPropagation();const ok=await showConfirm('Remove','Remove this entry?','Remove');if(!ok)return;const idx=Store.spend.findIndex(x=>x.id===id);if(idx>-1)Store.spend.splice(idx,1);await Store.saveAll();toast('Removed');refresh();}

// ── USER MANAGEMENT ────────────────────────────────────────────
function openAddUser(){
  document.getElementById('user-modal-ttl').textContent='Add Agent Account';
  document.getElementById('u-id').value='';document.getElementById('u-username').value='';document.getElementById('u-password').value='';
  document.getElementById('u-comm').value='';document.getElementById('u-role').value='agent';
  document.getElementById('u-link-grp').style.display='';document.getElementById('u-role-grp').style.display=isOwner()?'':'none';
  document.getElementById('u-join-date-grp').style.display=isOwner()?'':'none';
  document.getElementById('u-join-date').value='';document.getElementById('user-err').style.display='none';
  Store.loadLocal();
  const existing=Store.users.filter(u=>u.agentId).map(u=>u.agentId);
  const avail=Store.crmMembers.filter(m=>!existing.includes(m.id));
  let opts='<option value="">Select from hierarchy...</option>';
  avail.forEach(m=>{opts+=`<option value="${m.id}">${m.name} (${Store.agN(m.agency)})</option>`;});
  document.getElementById('u-agent-link').innerHTML=opts;openMod('modal-user');
}
function openRegisterUser(memberId){openAddUser();document.getElementById('u-agent-link').value=memberId;}
function openEditUser(uid){
  const u=Store.users.find(x=>x.id===uid);if(!u)return;
  document.getElementById('user-modal-ttl').textContent='Edit — '+(u.agentName||u.username);
  document.getElementById('u-id').value=u.id;document.getElementById('u-username').value=u.username;
  document.getElementById('u-password').value=u.pwd;document.getElementById('u-comm').value=u.commission||'';
  document.getElementById('u-role').value=u.role;document.getElementById('u-link-grp').style.display='none';
  document.getElementById('u-role-grp').style.display=isOwner()?'':'none';
  document.getElementById('u-join-date-grp').style.display=isOwner()?'':'none';
  document.getElementById('u-join-date').value=u.joinDate||'';document.getElementById('user-err').style.display='none';openMod('modal-user');
}
async function saveUser(){
  const uid=document.getElementById('u-id').value;const username=document.getElementById('u-username').value.trim();const pwd=document.getElementById('u-password').value.trim();const comm=document.getElementById('u-comm').value.trim();const role=document.getElementById('u-role').value||'agent';const joinDate=document.getElementById('u-join-date').value;
  const errEl=document.getElementById('user-err');errEl.style.display='none';
  if(!username){errEl.textContent='Username required.';errEl.style.display='block';return;}
  if(!pwd){errEl.textContent='Password required.';errEl.style.display='block';return;}
  if(Store.users.find(u=>u.username.toLowerCase()===username.toLowerCase()&&u.id!==uid)){errEl.textContent='Username already exists.';errEl.style.display='block';return;}
  if(uid){const u=Store.users.find(x=>x.id===uid);if(!u)return;u.username=username;u.pwd=pwd;u.commission=comm;if(isOwner()){u.role=role;u.joinDate=joinDate;}}
  else{const link=document.getElementById('u-agent-link').value;if(!link){errEl.textContent='Please select a CRM member.';errEl.style.display='block';return;}const m=Store.getMember(link);Store.users.push({id:'u_'+Store.uid(),username,pwd,role:'agent',agentId:link,agentName:m?.name||link,agencyId:m?.agency||null,commission:comm,active:true,createdAt:new Date().toISOString().split('T')[0],joinDate,bio:'',links:{},avatar:'',badges:[],wornBadgeId:null});}
  await Store.saveAll();closeMod('modal-user');renderManageUsers();toast('Account saved');
}
async function deactivateUser(uid){
  if(['u_jc','u_ty'].includes(uid)){toast('This account cannot be deactivated.');return;}
  const ok=await showConfirm('Deactivate Account','Agent will lose login access. All their data is preserved.','Deactivate');if(!ok)return;
  const u=Store.users.find(x=>x.id===uid);if(!u)return;
  u.active=false;await Store.saveAll();renderManageUsers();toast('Deactivated — data preserved');
}

// ── FIREBASE/DB ────────────────────────────────────────────────
function openGHModal(){openMod('modal-gh');GH.updateStatus(true);}
async function testGH(){toast('Firebase is always connected');}
async function saveGHConfig(){closeMod('modal-gh');}

// ── CSV EXPORT ─────────────────────────────────────────────────
function dlReport(type){Store.loadLocal();const tf=TF.rpt;const cs=document.getElementById('rpt-cs')?.value||null;const ce=document.getElementById('rpt-ce')?.value||null;let csv='',filename='';
  if(type==='lb'){const lb=Store.buildLB(tf,cs,ce);csv='Rank,Agent,Agency,AP,MP,Deals,Refs\n';lb.forEach((r,i)=>{csv+=`${i+1},"${r.name}","${Store.agN(r.agencyId)}",${r.ap},${r.mp},${r.count},${r.refs||0}\n`;});filename=`cornerstone_lb_${tf}.csv`;}
  else if(type==='deals'){const d=Store.filterByTF(Store.deals,tf,'date',cs,ce).sort((a,b)=>new Date(b.date)-new Date(a.date));csv='Date,Agent,Policy Type,Lead Type,Carrier,MP,AP,Referrals\n';d.forEach(x=>{const u=Store.users.find(y=>y.agentId===x.agentId);csv+=`"${x.date}","${u?.agentName||x.agentId}","${x.policyType||''}","${x.leadType||''}","${x.carrier||''}",${x.mp},${x.ap},${x.referrals||0}\n`;});filename=`cornerstone_deals_${tf}.csv`;}
  else if(type==='teams'){const fd=Store.filterByTF(Store.deals,tf,'date',cs,ce);csv='Manager,Personal AP,Team AP,Downline,Deals\n';Store.getAgentUsers().forEach(u=>{const myD=fd.filter(d=>d.agentId===u.agentId);const downIds=Store.getDownlineIds(u.agentId);const downD=fd.filter(d=>downIds.includes(d.agentId));const da=Store.getAgentUsers().filter(au=>downIds.includes(au.agentId)).length;csv+=`"${u.agentName}",${Store.totalAP(myD)},${Store.totalAP(myD)+Store.totalAP(downD)},${da},${myD.length+downD.length}\n`;});filename=`cornerstone_teams_${tf}.csv`;}
  else if(type==='roi'){const fd=Store.filterByTF(Store.deals,tf,'date',cs,ce);const fs=Store.filterByTF(Store.spend,tf,'weekOf',cs,ce);csv='Agent,AP,Comm %,Earnings,Spend,Net,ROI\n';Store.getAgentUsers().forEach(u=>{const myD=fd.filter(d=>d.agentId===u.agentId);const myS=fs.filter(s=>s.agentId===u.agentId);const ap=Store.totalAP(myD);const comm=parseFloat(u.commission)||0;const earned=ap*(comm/100);const ts=myS.reduce((s,x)=>s+(x.amount||0),0);const net=earned-ts;const roi=ts>0?((net/ts)*100).toFixed(1):'N/A';csv+=`"${u.agentName}",${ap},${comm},${earned.toFixed(2)},${ts.toFixed(2)},${net.toFixed(2)},${roi}\n`;});filename=`cornerstone_roi_${tf}.csv`;}
  if(!csv){toast('No data');return;}const blob=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();toast('Downloaded');
}

function openRecruitCRM(){window.location.href='recruit.html';}
