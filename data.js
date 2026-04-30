/* ═══════════════════════════════════════════════════════════════
   data.js — Cornerstone Council · Unified Data Store v5
═══════════════════════════════════════════════════════════════ */
const Store = (() => {

  const MAX_UNDO=80;

  // ── DEFAULT PORTAL ACCOUNTS ────────────────────────────────────
  const DEF_USERS=[
    {id:'u_jc',username:'JC',pwd:'Josh09212002',role:'admin',agentId:'joshua-001',agentName:'Joshua Cribb',agencyId:'cornerstone',commission:'',active:true,createdAt:'2024-01-01',joinDate:'2024-01-01',bio:'',links:{},avatar:'',badges:[],wornBadgeId:null,wornBadges:['','','']},
    {id:'u_ty',username:'TyreseDuke90',pwd:'2026',role:'admin',agentId:'tyrese-001',agentName:'Tyrese Williams',agencyId:'cornerstone',commission:'',active:true,createdAt:'2024-01-01',joinDate:'2024-01-01',bio:'',links:{},avatar:'',badges:[],wornBadgeId:null,wornBadges:['','','']},
    {id:'u_own',username:'teamcornerstone',pwd:'Manager26',role:'owner',agentId:null,agentName:'Team Cornerstone',agencyId:null,commission:'',active:true,createdAt:'2024-01-01',joinDate:'2024-01-01',bio:'',links:{},avatar:'',badges:[],wornBadgeId:null,wornBadges:['','','']},
  ];

  // ── SEED CRM HIERARCHY (mirrors recruit.html SEED) ─────────────
  // This ensures the portal always has hierarchy data even before
  // recruit.html has been opened on this device.
  const SEED_MEMBERS=[
    {id:'tyrese-001',name:'Tyrese Williams',dob:'2002-08-04',zodiac:'horse',lifePath:7,dayEnergy:4,agency:'cornerstone',uplineId:null,role:'Owner – Cornerstone',commission:'',notes:'',addedAt:'2024-01-01',protected:true,isOwner:true},
    {id:'elijah-001',name:'Elijah Mang',dob:'2000-02-23',zodiac:'dragon',lifePath:1,dayEnergy:5,agency:'radiant',uplineId:null,role:'Owner – Radiant Financial',commission:'',notes:'',addedAt:'2024-01-01',protected:true,isOwner:true},
    {id:'max-001',name:'Max',dob:'2005-06-10',zodiac:'rooster',lifePath:4,dayEnergy:1,agency:'trine2',uplineId:null,role:'Owner – Agency Three',commission:'',notes:'',addedAt:'2024-01-01',protected:false,isOwner:true},
    {id:'emily-001',name:'Emily Cribb',dob:'2007-03-07',zodiac:'pig',lifePath:1,dayEnergy:7,agency:'trine4',uplineId:null,role:'Owner – Agency Four',commission:'',notes:'',addedAt:'2024-01-01',protected:false,isOwner:true},
    {id:'joshua-001',name:'Joshua Cribb',dob:'2002-09-21',zodiac:'horse',lifePath:7,dayEnergy:3,agency:'cornerstone',uplineId:'tyrese-001',role:'Direct to Cornerstone',commission:'',notes:'',addedAt:'2024-01-01',protected:true,isOwner:false},
    {id:'quincy-001',name:'Quincy Farley',dob:'1978-10-01',zodiac:'horse',lifePath:8,dayEnergy:1,agency:'cornerstone',uplineId:'tyrese-001',role:'Direct to Cornerstone',commission:'',notes:'',addedAt:'2024-01-01',protected:false,isOwner:false},
  ];
  const SEED_AGENCIES={
    cornerstone:{name:'Cornerstone Council',signs:['tiger','horse','dog'],col:'#c9a84c',bc2:'bg',trineId:'t3',foundingDob:''},
    radiant:{name:'Radiant Financial',signs:['dragon','rat','monkey'],col:'#b39ddb',bc2:'bp',trineId:'t1',foundingDob:''},
    trine2:{name:'Agency Three',signs:['ox','snake','rooster'],col:'#80cbc4',bc2:'bb',trineId:'t2',foundingDob:''},
    trine4:{name:'Agency Four',signs:['cat','goat','pig'],col:'#81c784',bc2:'bv',trineId:'t4',foundingDob:''},
  };

  // ── STATE ──────────────────────────────────────────────────────
  let state={
    users:[],deals:[],spend:[],incentives:[],monthlyReports:[],
    recruitPosts:[],  // private recruit posts per agent
    personalGoals:[],   // private per-agent goals
    chargebacks:[],     // private per-agent chargebacks
    crmMembers:[],crmAgencies:{},crmCounter:5,
    undoStack:[],redoStack:[],
  };

  // ── LOAD LOCAL ─────────────────────────────────────────────────
  function loadLocal(){
    // Seeds defaults into memory — real data always comes from Firebase via syncFromGH()
    if(!state.users.length) state.users=JSON.parse(JSON.stringify(DEF_USERS));
    DEF_USERS.forEach(du=>{if(!state.users.find(u=>u.id===du.id))state.users.push({...du});});
    _migrateState();
    if(!state.crmMembers.length) state.crmMembers=JSON.parse(JSON.stringify(SEED_MEMBERS));
    if(!Object.keys(state.crmAgencies).length) state.crmAgencies=JSON.parse(JSON.stringify(SEED_AGENCIES));
  }

  function _migrateState(){
    state.users.forEach(u=>{
      if(u.bio===undefined)u.bio='';
      if(u.links===undefined)u.links={};
      if(u.avatar===undefined)u.avatar='';
      if(u.joinDate===undefined)u.joinDate='';
      if(u.commission===undefined)u.commission='';
      if(u.badges===undefined)u.badges=[];
      if(u.wornBadgeId===undefined)u.wornBadgeId=null;
      if(u.wornBadges===undefined)u.wornBadges=['','',''];
      if(u.prefs===undefined)u.prefs={};
      if(u.id==='u_elite'||u.username==='founders')u.active=false;
    });
    state.deals.forEach(d=>{
      if(d.referrals===undefined)d.referrals=0;
      if(d.leadType===undefined)d.leadType='';
      if(d.leadSource===undefined)d.leadSource='';
      if(d.eftDate===undefined)d.eftDate='';
    });
  }

  // No localStorage writes — everything goes to Firebase only
  function saveLocal(){} // no-op kept for compat

  // ── FIREBASE PAYLOAD ───────────────────────────────────────────
  function _buildPayload(){
    return{version:'5.1',lastUpdated:new Date().toISOString(),
      users:state.users,deals:state.deals,spend:state.spend,
      incentives:state.incentives,monthlyReports:state.monthlyReports,
      recruitPosts:state.recruitPosts,
      personalGoals:state.personalGoals,
      chargebacks:state.chargebacks,
      crmMembers:state.crmMembers,crmAgencies:state.crmAgencies,crmCounter:state.crmCounter};
  }

  // ── SYNC FROM FIREBASE ─────────────────────────────────────────
  async function syncFromGH(){
    const payload=_buildPayload();
    const remote=await GH.init(payload);
    if(!remote)return false;
    if(remote.users?.length)state.users=remote.users;
    if(remote.deals?.length)state.deals=remote.deals;
    if(remote.spend?.length)state.spend=remote.spend;
    if(remote.incentives?.length)state.incentives=remote.incentives;
    if(remote.monthlyReports?.length)state.monthlyReports=remote.monthlyReports;
    if(remote.recruitPosts?.length)state.recruitPosts=remote.recruitPosts;
    if(remote.personalGoals?.length)state.personalGoals=remote.personalGoals;
    if(remote.chargebacks?.length)state.chargebacks=remote.chargebacks;
    if(remote.crmMembers?.length)state.crmMembers=remote.crmMembers;
    if(remote.crmAgencies&&Object.keys(remote.crmAgencies).length)state.crmAgencies=remote.crmAgencies;
    if(remote.crmCounter!==undefined)state.crmCounter=remote.crmCounter;
    DEF_USERS.forEach(du=>{if(!state.users.find(u=>u.id===du.id))state.users.push({...du});});
    state.crmMembers.forEach(m=>{if(m.zodiac==='cat')m.zodiac='cat';});
    state.users.forEach(u=>{
      if(u.badges===undefined)u.badges=[];
      if(u.wornBadgeId===undefined)u.wornBadgeId=null;
      if(u.wornBadges===undefined)u.wornBadges=['','',''];
      if(u.prefs===undefined)u.prefs={};
      // Preserve manager role
      if(u.role==='manager')u.role='manager';

    });
    state.deals.forEach(d=>{
      if(d.referrals===undefined)d.referrals=0;
      if(d.leadType===undefined)d.leadType='';
      if(d.leadSource===undefined)d.leadSource='';
      if(d.eftDate===undefined)d.eftDate='';
    });
    
    return true;
  }

  async function pushToGH(){return GH.push(_buildPayload());}
  async function saveCRM(){await pushToGH();}
  async function saveAll(){pushUndo();await pushToGH();}

  // ── UNDO / REDO ────────────────────────────────────────────────
  function _snap(){return{
    users:JSON.parse(JSON.stringify(state.users)),
    deals:JSON.parse(JSON.stringify(state.deals)),
    spend:JSON.parse(JSON.stringify(state.spend)),
    incentives:JSON.parse(JSON.stringify(state.incentives)),
    monthlyReports:JSON.parse(JSON.stringify(state.monthlyReports)),
    recruitPosts:JSON.parse(JSON.stringify(state.recruitPosts)),
    crmMembers:JSON.parse(JSON.stringify(state.crmMembers)),
    crmAgencies:JSON.parse(JSON.stringify(state.crmAgencies)),
    crmCounter:state.crmCounter,
  };}
  function pushUndo(){state.undoStack.push(_snap());if(state.undoStack.length>MAX_UNDO)state.undoStack.shift();state.redoStack=[];updateUndoBtns();}
  function _restore(s){state.users=s.users;state.deals=s.deals;state.spend=s.spend;state.incentives=s.incentives;state.monthlyReports=s.monthlyReports||[];state.recruitPosts=s.recruitPosts||[];state.crmMembers=s.crmMembers;state.crmAgencies=s.crmAgencies;state.crmCounter=s.crmCounter;}
  async function undo(){if(!state.undoStack.length)return false;state.redoStack.push(_snap());_restore(state.undoStack.pop());await pushToGH();updateUndoBtns();return true;}
  async function redo(){if(!state.redoStack.length)return false;state.undoStack.push(_snap());_restore(state.redoStack.pop());await pushToGH();updateUndoBtns();return true;}
  function updateUndoBtns(){const u=document.getElementById('undo-btn');const r=document.getElementById('redo-btn');if(u)u.disabled=!state.undoStack.length;if(r)r.disabled=!state.redoStack.length;}

  // ── HELPERS ────────────────────────────────────────────────────
  function uid(){return'x'+Date.now()+Math.random().toString(36).slice(2,7);}
  function getAgentUsers(){return state.users.filter(u=>u.active!==false&&u.agentId);}
  function getMember(id){return state.crmMembers.find(m=>m.id===id);}
  function getDownlineIds(memberId){
    const direct=state.crmMembers.filter(m=>m.uplineId===memberId).map(m=>m.id);
    let all=[...direct];direct.forEach(id=>{all=[...all,...getDownlineIds(id)];});return all;
  }
  function isManager(agentId){if(!agentId)return false;return getDownlineIds(agentId).some(id=>state.users.find(u=>u.agentId===id&&u.active!==false));}
  function totalAP(arr){return arr.reduce((s,d)=>s+(d.ap||0),0);}
  function totalMP(arr){return arr.reduce((s,d)=>s+(d.mp||0),0);}
  function totalReferrals(arr){return arr.reduce((s,d)=>s+(d.referrals||0),0);}
  function agN(aid){if(!aid)return'Cornerstone';return state.crmAgencies[aid]?.name||(aid.charAt(0).toUpperCase()+aid.slice(1));}
  function getMondayOf(ds){const d=new Date(ds+'T12:00:00');const dy=d.getDay();d.setDate(d.getDate()-(dy===0?6:dy-1));return d.toISOString().split('T')[0];}

  function filterByTF(arr,tf,df,cs,ce){
    if(tf==='alltime'||tf==='lifetime')return arr;
    const now=new Date();
    let s,e=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59);
    switch(tf){
      case'today':s=new Date(now.getFullYear(),now.getMonth(),now.getDate());break;
      case'daily':s=new Date(now.getFullYear(),now.getMonth(),now.getDate());break;
      case'week':{const dw=now.getDay();s=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(dw===0?6:dw-1));break;}
      case'month':s=new Date(now.getFullYear(),now.getMonth(),1);break;
      case'ytd':s=new Date(now.getFullYear(),0,1);break;
      case'bimonthly':s=new Date(now.getFullYear(),now.getMonth()-1,1);break;
      case'q1':s=new Date(now.getFullYear(),0,1);e=new Date(now.getFullYear(),2,31,23,59,59);break;
      case'q2':s=new Date(now.getFullYear(),3,1);e=new Date(now.getFullYear(),5,30,23,59,59);break;
      case'q3':s=new Date(now.getFullYear(),6,1);e=new Date(now.getFullYear(),8,30,23,59,59);break;
      case'q4':s=new Date(now.getFullYear(),9,1);e=new Date(now.getFullYear(),11,31,23,59,59);break;
      case'custom':if(!cs||!ce)return arr;s=new Date(cs+'T00:00:00');e=new Date(ce+'T23:59:59');break;
      default:s=new Date(now.getFullYear(),now.getMonth(),1);
    }
    return arr.filter(item=>{const d=new Date((item[df]||item.date)+'T12:00:00');return d>=s&&d<=e;});
  }

  function buildLB(tf,cs,ce){
    const filt=filterByTF(state.deals,tf,'date',cs,ce);
    return getAgentUsers().map(u=>{
      const myD=filt.filter(d=>d.agentId===u.agentId);
      const m=getMember(u.agentId);
      return{userId:u.id,agentId:u.agentId,name:u.agentName,agencyId:m?.agency||u.agencyId,ap:totalAP(myD),mp:totalMP(myD),count:myD.length,refs:totalReferrals(myD)};
    }).sort((a,b)=>b.ap-a.ap);
  }

  // Incentive progress calculator

  function isBirthday(agentId){
    const m=getMember(agentId);
    if(!m?.dob)return false;
    const now=new Date();
    const dob=new Date(m.dob+'T12:00:00');
    return dob.getMonth()===now.getMonth()&&dob.getDate()===now.getDate();
  }
  function hasBirthdayWarriorBadge(userId){
    const u=state.users.find(x=>x.id===userId);
    return(u?.badges||[]).some(b=>b.id==='birthday-warrior-'+userId||b.birthdayWarrior===true);
  }
  function _calcOneMetric(metric,myDeals,inc,agentId,scope){
    if(metric==='ap'){
      if(inc.id==='amam-trip-winner')return totalAP(myDeals.filter(d=>d.carrier==='American Amicable'));
      return totalAP(myDeals);
    }
    if(metric==='deals')return myDeals.length;
    if(metric==='referrals')return totalReferrals(myDeals);
    if(metric==='allreferrals')return totalReferrals(myDeals)+myDeals.filter(d=>d.leadType==='Warm Market').length;
    if(metric==='warmmarket')return myDeals.filter(d=>d.leadType==='Warm Market').length;
    if(metric==='days'){const days=new Set(myDeals.map(d=>d.date));return days.size;}
    if(metric==='recruits'){
      const rPosts=filterByTF(state.recruitPosts.filter(p=>scope==='personal'?p.agentId===agentId:true),'custom','date',inc.startDate||null,inc.endDate||null);
      return rPosts.length;
    }
    return 0;
  }

  // Returns [{metric, goal, current}] — supports multi-metric incentives
  function incProgressAll(inc,agentId){
    const tfD=filterByTF(state.deals,'custom','date',inc.startDate||null,inc.endDate||null);
    const scope=inc.scope||'agency';
    let myDeals=[];
    if(scope==='agency')myDeals=tfD;
    else if(scope==='personal')myDeals=agentId?tfD.filter(d=>d.agentId===agentId):[];
    else if(scope==='team'){const tIds=agentId?[agentId,...getDownlineIds(agentId)]:[];myDeals=tfD.filter(d=>tIds.includes(d.agentId));}
    const metrics=inc.metrics&&inc.metrics.length?inc.metrics:[{metric:inc.metric||'ap',goal:inc.goal||0}];
    return metrics.map(m=>({
      metric:m.metric||'ap',
      goal:parseFloat(m.goal)||0,
      current:_calcOneMetric(m.metric||'ap',myDeals,inc,agentId,scope)
    }));
  }

  function incProgress(inc,agentId){
    return (incProgressAll(inc,agentId)[0]||{}).current||0;
  }


  // Calculate current progress for a personal goal
  function goalProgress(goal, agentId){
    const now=new Date();
    // Determine window start based on reset period
    let startDate=null;
    if(goal.period==='daily'){startDate=new Date(now.getFullYear(),now.getMonth(),now.getDate());}
    else if(goal.period==='weekly'){
      const day=now.getDay(); // 0=Sun
      startDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()-day);
    }
    else if(goal.period==='monthly'){startDate=new Date(now.getFullYear(),now.getMonth(),1);}
    else if(goal.period==='yearly'){startDate=new Date(now.getFullYear(),0,1);}
    const deals=startDate
      ?state.deals.filter(d=>d.agentId===agentId&&new Date(d.date+'T12:00:00')>=startDate)
      :state.deals.filter(d=>d.agentId===agentId);
    const metric=goal.metric||'ap';
    if(metric==='ap')return totalAP(deals);
    if(metric==='deals')return deals.length;
    if(metric==='referrals')return totalReferrals(deals);
    if(metric==='warmmarket')return deals.filter(d=>d.leadType==='Warm Market').length;
    if(metric==='days'){const days=new Set(deals.map(d=>d.date));return days.size;}
    return 0;
  }


  // Persistency: % of deals from N months ago that are still active (no chargeback)
  function persistencyScore(agentId, monthsBack){
    const now=new Date();
    const windowEnd=new Date(now.getFullYear(),now.getMonth()-monthsBack+1,1);
    const windowStart=new Date(now.getFullYear(),now.getMonth()-monthsBack-1,1);
    const dealsInWindow=state.deals.filter(d=>{
      if(d.agentId!==agentId)return false;
      const dd=new Date(d.date+'T12:00:00');
      return dd>=windowStart&&dd<windowEnd;
    });
    if(!dealsInWindow.length)return null; // no data
    const cbAP=state.chargebacks
      .filter(cb=>cb.agentId===agentId)
      .reduce((s,cb)=>{
        const cbDate=new Date(cb.date+'T12:00:00');
        if(cbDate<windowEnd)return s;
        return s+(cb.mp*12||0);
      },0);
    const totalAP=dealsInWindow.reduce((s,d)=>s+(d.ap||0),0);
    if(!totalAP)return null;
    return Math.max(0,Math.min(100,Math.round(((totalAP-cbAP)/totalAP)*100)));
  }

  return{
    get users(){return state.users;},
    get deals(){return state.deals;},
    get spend(){return state.spend;},
    get incentives(){return state.incentives;},
    get monthlyReports(){return state.monthlyReports;},
    get recruitPosts(){return state.recruitPosts;},
    get personalGoals(){return state.personalGoals;},
    get chargebacks(){return state.chargebacks;},
    get crmMembers(){return state.crmMembers;},
    get crmAgencies(){return state.crmAgencies;},
    get crmCounter(){return state.crmCounter;},
    set crmCounter(v){state.crmCounter=v;},
    loadLocal,saveLocal,saveAll,saveCRM,syncFromGH,pushToGH,DEF_USERS,SEED_MEMBERS,
    undo,redo,pushUndo,updateUndoBtns,
    uid,getAgentUsers,getMember,getDownlineIds,isManager,isBirthday,hasBirthdayWarriorBadge,
    totalAP,totalMP,totalReferrals,agN,getMondayOf,filterByTF,buildLB,incProgress,incProgressAll,
    goalProgress,persistencyScore,
  };
})();
