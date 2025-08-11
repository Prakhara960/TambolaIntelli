const API_BASE = "https://script.google.com/macros/s/AKfycbxz_QEsc9fw9JbzhVbcrjIwaJ0jto35YsVvZVueS1BgxpM4GJIXWfG7bsnWlnWutJhIiQ/exec"; // <-- paste deployed Web App URL here (include https://...)

// UI refs
const $ = id => document.getElementById(id);
let currentRoom = null, myPlayerId = null, myName = null, pollHandle = null, isHost=false, autoCalling=false;

async function api(action, payload={}){
  payload.action = action;
  const res = await fetch(API_BASE, { method:'POST', body: JSON.stringify(payload) });
  return await res.json();
}

/* Bind buttons */
function bindUI(){
  $('createRoomBtn').onclick = async ()=>{
    const name = $('hostName').value.trim() || prompt('Host name') || 'Host';
    const res = await api('createRoom',{hostName:name});
    if(res.ok){ myPlayerId = res.playerId || null; myName = name; isHost=true; enterRoom(res.roomCode); renderTicket(res.ticket); }
    else alert('Create failed');
  };

  $('joinRoomBtn').onclick = async ()=>{
    const name = $('joinName').value.trim() || prompt('Your name') || 'Player';
    const code = $('joinCode').value.trim() || prompt('Room code');
    if(!code) return alert('Enter room code');
    const res = await api('joinRoom',{roomCode:code, playerName:name});
    if(res.ok){ myName = name; isHost = false; myPlayerId = res.playerId || null; enterRoom(code); renderTicket(res.ticket); }
    else alert(res.error || 'Join failed');
  };

  $('leaveBtn').onclick = ()=> location.reload();
  $('copyLink').onclick = ()=> { navigator.clipboard.writeText(location.href + '?room=' + currentRoom); alert('Link copied'); };

  $('addDivBtn').onclick = async ()=>{
    const n = $('divName').value.trim(); const a = Number($('divAmt').value);
    if(!n || !a) return alert('Enter dividend name & amount');
    await api('addDividend',{roomCode:currentRoom, name:n, amount:a}); $('divName').value=''; $('divAmt').value=''; refreshOnce();
  };

  $('callNumberBtn').onclick = async ()=>{
    const res = await api('callNumber',{roomCode:currentRoom});
    if(res.ok){ playSound(); alert('Called: '+res.number); refreshOnce(); } else alert(res.error||'Call failed');
  };

  $('autoCallBtn').onclick = ()=>{ autoCalling=true; $('autoCallBtn').classList.add('hidden'); $('stopAutoBtn').classList.remove('hidden'); autoCallLoop(); };
  $('stopAutoBtn').onclick = ()=>{ autoCalling=false; $('autoCallBtn').classList.remove('hidden'); $('stopAutoBtn').classList.add('hidden'); };
}

/* Enter room (UI switch) */
function enterRoom(code){
  currentRoom = code;
  $('lobby').classList.add('hidden');
  $('roomView').classList.remove('hidden');
  $('roomCode').innerText = code;
  $('myName').innerText = myName || '';
  startPolling();
}

/* Polling */
function startPolling(){ if(pollHandle) clearInterval(pollHandle); refreshOnce(); pollHandle = setInterval(refreshOnce,2000); }
async function refreshOnce(){
  if(!currentRoom) return;
  const state = await api('getState',{roomCode:currentRoom});
  if(state && state.ok) renderState(state);
}

/* Render overall state */
function renderState(state){
  // players
  const pl = $('playersList'); pl.innerHTML='';
  (state.players||[]).forEach(p=>{ const li=document.createElement('li'); li.textContent = p.name + (p.playerId===myPlayerId ? ' (You)' : ''); pl.appendChild(li); });
  $('playersCount').innerText = (state.players||[]).length;

  // dividends
  const dv = $('dividendsList'); dv.innerHTML='';
  (state.dividends||[]).forEach(d=>{ const el=document.createElement('div'); el.textContent = `${d.name} — ₹${d.amount}`; dv.appendChild(el); });

  // claims
  const cl = $('claimsList'); cl.innerHTML='';
  (state.claims||[]).forEach(c=>{
    const li=document.createElement('li'); li.innerText = `${c.playerName} → ${c.prizeName} ₹${c.amount} [${c.status}]`;
    if(isHost && c.status==='pending'){
      const ok=document.createElement('button'); ok.className='btn small'; ok.innerText='Approve'; ok.onclick= async ()=>{ await api('resolveClaim',{claimId:c.claimId, status:'approved'}); refreshOnce(); };
      const rej=document.createElement('button'); rej.className='btn small'; rej.innerText='Reject'; rej.onclick= async ()=>{ await api('resolveClaim',{claimId:c.claimId, status:'rejected'}); refreshOnce(); };
      li.appendChild(ok); li.appendChild(rej);
    }
    cl.appendChild(li);
  });

  // my ticket rendering (find me)
  const me = (state.players||[]).find(p=>p.name===myName) || (state.players||[]).find(p=>p.playerId===myPlayerId);
  if(me && me.ticket) renderTicket(me.ticket);
  // board 1..90
  const board = $('tambolaBoard'); board.innerHTML='';
  for(let n=1;n<=90;n++){
    const cell = document.createElement('div'); cell.className='boardCell'; cell.innerText = n;
    if((state.called||[]).indexOf(n)>-1) cell.classList.add('called');
    board.appendChild(cell);
  }
  $('lastFive').innerText = (state.last5||[]).slice(-5).join(', ');
  $('calledCount').innerText = (state.called||[]).length;
}

/* Ticket renderer: 3x9 grid */
function renderTicket(grid){
  const t = $('myTicket'); t.innerHTML='';
  const g = grid || Array.from({length:3},()=>Array.from({length:9},()=>null));
  for(let r=0;r<3;r++){
    for(let c=0;c<9;c++){
      const cell = document.createElement('div'); cell.className='cell'; cell.innerText = g[r][c] ? g[r][c] : '';
      t.appendChild(cell);
    }
  }
}

/* Auto call loop */
async function autoCallLoop(){
  while(autoCalling){
    await api('callNumber',{roomCode:currentRoom});
    playSound();
    await new Promise(r=>setTimeout(r,3000));
  }
}

/* Sound */
function playSound(){ try{ const s = $('callSound'); if(s) s.play(); }catch(e){} }

/* Rooms list */
async function refreshRooms(){
  const res = await api('listRooms', {});
  if(res && res.ok){
    const ul = $('roomsList'); ul.innerHTML='';
    (res.roomsList||[]).forEach(r=>{
      const li=document.createElement('li');
      li.innerHTML = `<div><strong>${r.code}</strong> — ${r.host} — ${r.count} players</div><div><button class="btn" onclick="quickJoin('${r.code}')">Join</button></div>`;
      ul.appendChild(li);
    });
  }
}
window.quickJoin = code => $('joinCode').value = code;

/* Init */
document.addEventListener('DOMContentLoaded', ()=>{
  bindUI();
  refreshRooms();
  setInterval(refreshRooms,5000);
});
