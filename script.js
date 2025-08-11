/*
  script.js
  Frontend for IntelliTambola.
  Set API_BASE to your deployed Apps Script Web App URL (the URL you get when deploying).
*/
const API_BASE = "https://script.google.com/macros/s/AKfycbytff3gZZHyETXsRUzsF6b6O32zf9ssXSoFktXtugr8RsW_FWUQLcb4-nww2oB2-1I5Qw/exec";

const $ = id => document.getElementById(id);
let currentRoom=null, myPlayerId=null, myName=null, isHost=false, pollHandle=null, autoCalling=false;

async function api(action, payload={}){
  payload.action = action;
  const res = await fetch(API_BASE, { method:'POST', body: JSON.stringify(payload) });
  return await res.json();
}

function bindUI(){
  $('createRoomBtn').onclick = async ()=>{
    const name = $('hostName').value.trim() || prompt('Host name') || 'Host';
    const res = await api('createRoom',{name});
    if(res && res.ok){ myPlayerId = res.playerId; myName = name; isHost = true; enterRoom(res.roomCode); renderTicket(res.ticket); refreshRooms(); }
    else alert('Create failed');
  };

  $('joinRoomBtn').onclick = async ()=>{
    const name = $('joinName').value.trim() || prompt('Your name') || 'Player';
    const code = $('joinCode').value.trim() || prompt('Room code');
    if(!code) return alert('Enter room code');
    const res = await api('joinRoom',{roomCode:code, name});
    if(res && res.ok){ myPlayerId = res.playerId; myName = name; isHost = false; enterRoom(code); renderTicket(res.ticket); }
    else alert(res.error || 'Join failed');
  };

  $('leaveBtn').onclick = ()=> location.reload();
  $('copyLink').onclick = ()=> { navigator.clipboard.writeText(location.href + '?room=' + currentRoom); alert('Link copied'); };

  $('addDivBtn').onclick = async ()=> {
    const n = $('divName').value.trim(); const a = Number($('divAmt').value);
    if(!n || !a) return alert('Enter name & amount');
    await api('addDividend',{roomCode:currentRoom, name:n, amount:a}); $('divName').value=''; $('divAmt').value=''; refreshOnce();
  };

  $('callNumberBtn').onclick = async ()=>{
    if(!isHost) return alert('Only host can call numbers');
    const res = await api('callNumber',{roomCode:currentRoom, playerId: myPlayerId});
    if(!res || !res.ok) return alert(res && res.error ? res.error : 'Call failed');
    playSound(); refreshOnce();
  };

  $('autoCallBtn').onclick = ()=>{ if(!isHost) return alert('Only host'); autoCalling=true; $('autoCallBtn').classList.add('hidden'); $('stopAutoBtn').classList.remove('hidden'); autoCallLoop(); };
  $('stopAutoBtn').onclick = ()=>{ autoCalling=false; $('autoCallBtn').classList.remove('hidden'); $('stopAutoBtn').classList.add('hidden'); };

  refreshRooms();
  setInterval(refreshRooms,5000);
}

function enterRoom(code){
  currentRoom = code;
  $('lobby').classList.add('hidden'); $('roomView').classList.remove('hidden');
  $('roomCode').innerText = code; $('myName').innerText = myName || '';
  startPolling();
}

function startPolling(){ if(pollHandle) clearInterval(pollHandle); refreshOnce(); pollHandle = setInterval(refreshOnce,1000); }
async function refreshOnce(){
  if(!currentRoom) return;
  const state = await api('getState',{roomCode:currentRoom});
  if(state && state.ok) renderState(state);
}

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
    // both host & members can claim, but only host can resolve
    if(c.status==='pending' && isHost){
      const ok=document.createElement('button'); ok.className='btn small'; ok.innerText='Approve'; ok.onclick= async ()=>{ await api('resolveClaim',{claimId:c.claimId,status:'approved'}); refreshOnce(); };
      const rej=document.createElement('button'); rej.className='btn small'; rej.innerText='Reject'; rej.onclick= async ()=>{ await api('resolveClaim',{claimId:c.claimId,status:'rejected'}); refreshOnce(); };
      li.appendChild(ok); li.appendChild(rej);
    }
    cl.appendChild(li);
  });

  // my ticket
  const me = (state.players||[]).find(p=>p.playerId===myPlayerId) || (state.players||[]).find(p=>p.name===myName);
  if(me && me.ticket) renderTicket(me.ticket, state.called || []);
  renderBoard(state.called || []);
  $('lastFive').innerText = (state.last5||[]).slice(-5).join(', ');
  $('calledCount').innerText = (state.called||[]).length;
}

function renderBoard(called){
  const board = $('tambolaBoard'); board.innerHTML='';
  for(let i=1;i<=90;i++){
    const div = document.createElement('div'); div.className='boardCell'; div.innerText = i;
    if(called.indexOf(i) > -1) div.classList.add('called');
    board.appendChild(div);
  }
}

function renderTicket(grid, called){
  const t = $('myTicket'); t.innerHTML='';
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

async function autoCallLoop(){
  while(autoCalling){
    if(!isHost) break;
    const res = await api('callNumber',{roomCode:currentRoom, playerId:myPlayerId});
    if(!res || !res.ok){ autoCalling=false; $('autoCallBtn').classList.remove('hidden'); $('stopAutoBtn').classList.add('hidden'); break; }
    playSound();
    await new Promise(r=>setTimeout(r,1500));
  }
}

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

function playSound(){ try{ const s = $('callSound'); if(s) s.play(); }catch(e){} }

document.addEventListener('DOMContentLoaded', ()=>{
  bindUI();
  const params = new URLSearchParams(location.search);
  if(params.get('room')) $('joinCode').value = params.get('room');
});

function pollCalledNumbers() {
    setInterval(() => {
        fetch(`${SCRIPT_URL}?action=getCalledNumbers&roomCode=${roomCode}`)
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    updateBoard(data.calledNumbers);
                    updateLastFive(data.calledNumbers);
                }
            });
    }, 3000); // Every 3 seconds
}

function updateBoard(calledNumbers) {
    document.querySelectorAll(".number-cell").forEach(cell => {
        let num = parseInt(cell.dataset.number);
        if (calledNumbers.includes(num)) {
            cell.style.backgroundColor = "yellow"; // highlight called number
        }
    });
}

function updateLastFive(calledNumbers) {
    const lastFive = calledNumbers.slice(-5).reverse();
    document.getElementById("last-five").innerText = lastFive.join(", ");
}
