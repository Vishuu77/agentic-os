"use strict";
const $=(s)=>document.querySelector(s);
let activeUsecase="founder";
const PREFIX={founder:"You are the founder's operator (GitHub, docs, WhatsApp, cron). Give commands and files to run today. Task: ",robotics:"You are operating a robotics lab (ROS, experiments, hardware checklists). Be concrete: commands, topics, safety checks. Task: ",agency:"You are delivering client AI work (lead intake, proposal, delivery checklist, handover). Be client-ready and specific. Task: ",saas:"You are building multi-user SaaS (auth, profiles, limits, deploy). No billing needed; design local-first profiles. Task: "};

document.querySelectorAll(".uc").forEach(b=>b.onclick=()=>{document.querySelectorAll(".uc").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeUsecase=b.dataset.u;});

async function doctor(){
  try{
    const r=await fetch("api/doctor",{cache:"no-store"});const j=await r.json();
    const box=$("#lanes");box.innerHTML="";
    const checks=$("#laneChecks");checks.innerHTML="";
    let ready=0;
    j.lanes.forEach((l,i)=>{
      if(l.ready)ready++;
      const d=document.createElement("div");d.className="lane "+(l.ready?"ready":"down");d.style.animationDelay=(i*0.08)+"s";
      d.id="lane-"+l.lane;
      d.innerHTML=`<b>${l.ready?"🟢":"🔴"} ${l.lane}</b><small>${l.label||""}</small><br><span class="lbadge">${l.ready?"ready":"unavailable"}</span>`;
      box.appendChild(d);
      const lab=document.createElement("label");lab.innerHTML=`<input type="checkbox" data-lane="${l.lane}" ${l.ready?"checked":""}> ${l.lane}`;
      checks.appendChild(lab);
    });
    $("#laneSummary").textContent=`${ready}/${j.lanes.length} ready`;
    const pill=$("#statusPill");pill.className="pill "+(ready>0?"live":"idle");$("#statusText").textContent=ready>0?`${ready} lanes live`:"all lanes down";
  }catch(e){$("#statusText").textContent="server offline";}
}
function log(kind,msg){
  const t=$("#timeline");const empty=t.querySelector(".t-empty");if(empty)empty.remove();
  const d=document.createElement("div");d.className="t-item "+(kind||"");d.textContent=msg;t.prepend(d);
  while(t.children.length>40)t.lastChild.remove();
}
$("#copyBtn").onclick=()=>{navigator.clipboard.writeText($("#result").innerText||"");$("#copyBtn").textContent="copied!";setTimeout(()=>$("#copyBtn").textContent="copy",1200);};

$("#runBtn").onclick=async()=>{
  const base=$("#prompt").value.trim();
  if(!base){$("#prompt").focus();return;}
  const request=(PREFIX[activeUsecase]||"")+base;
  const lanes=[...document.querySelectorAll("#laneChecks input:checked")].map(x=>x.dataset.lane);
  const deadline=Number($("#deadline").value);
  const btn=$("#runBtn");btn.disabled=true;$("#runLabel").innerHTML=`Running<span class="typing"><i></i><i></i><i></i></span>`;
  $("#statusPill").className="pill busy";$("#statusText").textContent="racing lanes…";
  $("#result").innerHTML='<span class="muted">Racing opencode · hermes · openclaw — fastest answer wins…</span>';$("#meta").textContent="";
  document.querySelectorAll(".lane").forEach(x=>x.classList.remove("running"));
  log("","🚀 mission accepted ["+activeUsecase+"]");
  try{
    const res=await fetch("api/run",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({request,lanes,deadline})});
    const reader=res.body.getReader();const dec=new TextDecoder();let buf="";
    const handle=(ev,data)=>{
      if(ev==="progress"){
        if(data.type==="lane.start"){log("",`▶ ${data.lane} started`);const el=document.getElementById("lane-"+data.lane);if(el)el.classList.add("running");}
        if(data.type==="lane.result"){log(data.status==="ok"?"ok":data.status==="unavailable"?"bad":"warn",`${data.status==="ok"?"✅":"⚠️"} ${data.lane}: ${data.status} (${(data.durationMs/1000).toFixed(1)}s)`);const el=document.getElementById("lane-"+data.lane);if(el)el.classList.remove("running");}
      }
      if(ev==="result"){
        $("#result").textContent=data.deliverable||data.headline||"done";
        $("#meta").textContent=`winner: ${data.winner} · ${((data.wallMs||0)/1000).toFixed(1)}s · run ${data.runId}`;
        log("ok",`🏁 winner: ${data.winner}`);
        $("#statusPill").className="pill live";$("#statusText").textContent="delivered";
      }
      if(ev==="failed"){$("#result").textContent="FAILED: "+data.error;$("#statusPill").className="pill idle";}
    };
    while(true){
      const {done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});
      let idx;while((idx=buf.indexOf("\n\n"))>=0){const chunk=buf.slice(0,idx);buf=buf.slice(idx+2);
        const m=chunk.match(/event: (\w+)\ndata: ([\s\S]*)/);if(m){try{handle(m[1],JSON.parse(m[2]));}catch{}}}
    }
  }catch(e){$("#result").textContent="Error: "+e;}
  btn.disabled=false;$("#runLabel").textContent="▶ Run mission";doctor();
};
doctor();setInterval(doctor,30000);
