const API_BASE = "https://script.google.com/macros/s/AKfycbw1jH9SITJEBrgkj9BzyTFaGqQ7TaxeHvhrKidksX0qBG9NghGtQBL6_sNjsA2ihd7ywA/exec"; // <-- paste deployed Apps Script Web App URL here

const $ = id => document.getElementById(id);
let currentRoom=null, myPlayerId=null, myName=null, isHost=false, pollHandle=null, autoCalling=false;

async function api(action, payload={}){
  payload.action = action;
  const res = await fetch(API_BASE, { method:'POST', body: JSON.stringify(payload) });
  return await res.json();
}

/* UI binding */
function bindUI(){
  $('createRoomBtn').onclick = async ()=>{
    const name = $('hostName').value.trim() || prompt('Host name') || 'Host';
    const res = await api('createRoom',{name});
    if(res.ok){ myPlayerId=res.playerId; myName=name; isHost=true; enterRoom(res.roomCode); renderTicket(res.ticket); refreshRooms(); }
    else alert('Create failed');
  };

  $('joinRoomBtn').onclick = async ()=>{
    const name = $('joinName').value.trim() || prompt('Your name') || 'Player';
    const code = $('joinCode').value.trim() || prompt('Room Code');
    if(!code) return alert('Enter room code');
    const res = await api('joinRoom',{roomCode:code,name});
    if(res.ok){ myPlayerId=res.playerId; myName=name; isHost=false; enterRoom(code); renderTicket(res.ticket); }
    else alert(res.error || 'Join failed');
  };

  $('leaveBtn').onclick = ()=> location.reload();
  $('copyLink').onclick = ()=> { navigator.clipboard.writeText(location.href + '?room=' + currentRoom); alert('Link copied'); };

  $('addDivBtn').onclick = async ()=> {
    const n = $('divName').value.trim(); const a = Number($('divAmt').value);
    if(!n || !a) return alert('Enter name & amount');
    await api('addDividend',{roomCode:currentRoom,name:n,amount:a}); $('divName').value=''; $('divAmt').value=''; refreshOnce();
  };

  $('callNumberBtn').onclick = async ()=>{
    if(!isHost) return alert('Only host can call numbers');
    const res = await api('callNumber',{roomCode:currentRoom, playerId: myPlayerId});
    if(!res.ok) return alert(res.error || 'Call failed');
    playSound(); refreshOnce();
  };

  $('autoCallBtn').onclick = ()=>{ if(!isHost) return alert('Only host'); autoCalling=true; $('autoCallBtn').classList.add('hidden'); $('stopAutoBtn').classList.remove('hidden'); autoCallLoop(); };
  $('stopAutoBtn').onclick = ()=>{ autoCalling=false; $('autoCallBtn').classList.remove('hidden'); $('stopAutoBtn').classList.add('hidden'); };

  // initial rooms load
  refreshRooms();
  setInterval(refreshRooms,5000);
}

/* Enter room view */
function enterRoom(code){
  currentRoom = code;
  $('lobby').classList.add('hidden'); $('roomView').classList.remove('hidden');
  $('roomCode').innerText = code; $('myName').innerText = myName || '';
  startPolling();
}

/* Polling */
function startPolling(){ if(pollHandle) clearInterval(pollHandle); refreshOnce(); pollHandle = setInterval(refreshOnce,1000); }
async function refreshOnce(){
  if(!currentRoom) return;
  const state = await api('getState',{roomCode:currentRoom});
  if(state && state.ok) renderState(state);
}

/* Render state */
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
      const ok=document.createElement('button'); ok.className='btn small'; ok.innerText='Approve'; ok.onclick= async ()=>{ await api('resolveClaim',{claimId:c.claimId,status:'approved'}); refreshOnce(); };
      const rej=document.createElement('button'); rej.className='btn small'; rej.innerText='Reject'; rej.onclick= async ()=>{ await api('resolveClaim',{claimId:c.claimId,status:'rejected'}); refreshOnce(); };
      li.appendChild(ok); li.appendChild(rej);
    }
    cl.appendChild(li);
  });

  // my ticket
  const me = (state.players||[]).find(p=>p.playerId===myPlayerId) || (state.players||[]).find(p=>p.name===myName);
  if(me && me.ticket) renderTicket(me.ticket, state.called || []);
  // board
  renderBoard(state.called || []);
  $('lastFive').innerText = (state.last5||[]).slice(-5).join(', ');
  $('calledCount').innerText = (state.called||[]).length;
}

/* Render board 1..90 and highlight called numbers in yellow */
function renderBoard(called){
  const board = $('tambolaBoard'); board.innerHTML='';
  for(let i=1;i<=90;i++){
    const div = document.createElement('div'); div.className='boardCell'; div.innerText = i;
    if(called.indexOf(i) > -1) div.classList.add('called');
    board.appendChild(div);
  }
}

/* Render 3x9 ticket grid. Highlights numbers that are already called with small mark */
function renderTicket(grid, called){
  const t = $('myTicket'); t.innerHTML='';
  // grid is 3x9
  for(let r=0;r<3;r++){
    for(let c=0;c<9;c++){
      const cell = document.createElement('div'); cell.className='cell';
      const val = (grid[r] && grid[r][c]) ? grid[r][c] : '';
      cell.innerText = val || '';
      if(val && called && called.indexOf(val)>-1) cell.classList.add('called');
      t.appendChild(cell);
    }
  }
}

/* Auto call loop */
async function autoCallLoop(){
  while(autoCalling){
    if(!isHost) break;
    const res = await api('callNumber',{roomCode:currentRoom, playerId:myPlayerId});
    if(!res.ok){ autoCalling=false; $('autoCallBtn').classList.remove('hidden'); $('stopAutoBtn').classList.add('hidden'); break; }
    playSound();
    await new Promise(r=>setTimeout(r,1500));
  }
}

/* Rooms list */
async function refreshRooms(){
  const res = await api('listRooms', {});
  if(res && res.ok){
    const ul = $('roomsList'); ul.innerHTML='';
    (res.roomsList||[]).forEach(r=>{
      const li = document.createElement('li');
      li.innerHTML = `<div><strong>${r.code}</strong> — ${r.hostName} — ${r.count} players</div><div><button class="btn" onclick="quickJoin('${r.code}')">Join</button></div>`;
      ul.appendChild(li);
    });
  }
}
window.quickJoin = code => $('joinCode').value = code;

/* sound */
function playSound(){ try{ const s = $('callSound'); if(s) s.play(); }catch(e){} }

/* init */
document.addEventListener('DOMContentLoaded', ()=>{
  bindUI();
  // if URL has ?room=... prefill
  const params = new URLSearchParams(location.search);
  if(params.get('room')) $('joinCode').value = params.get('room');
});
