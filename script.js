const backendUrl = "https://script.google.com/macros/s/AKfycbwRFKznvzi5-_Ecid7EsJG6w9TkMj7tCYq83eJ3Qy0zeR8-zKWDk_ikd6OzU2SAFQbw/exec";

document.getElementById("createRoomBtn").onclick = () => {
  let name = prompt("Enter host name:");
  fetch(backendUrl, {
    method: "POST",
    body: JSON.stringify({ action: "createRoom", name: name })
  })
  .then(res => res.json())
  .then(data => {
    alert("Room Created! Code: " + data.code);
    startGame(data.code, true);
  });
};

document.getElementById("joinRoomBtn").onclick = () => {
  let code = prompt("Enter room code:");
  let name = prompt("Enter your name:");
  fetch(backendUrl, {
    method: "POST",
    body: JSON.stringify({ action: "joinRoom", code: code, name: name })
  })
  .then(res => res.json())
  .then(data => {
    startGame(code, false, data.ticket);
  });
};

function startGame(code, isHost, ticket = null) {
  document.getElementById("home").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
  document.getElementById("roomCodeDisplay").innerText = "Room: " + code;

  if (!isHost) document.getElementById("hostControls").style.display = "none";

  renderBoard();
  if (ticket) renderTicket(ticket);

  setInterval(() => {
    fetch(backendUrl, {
      method: "POST",
      body: JSON.stringify({ action: "getGameData", code: code })
    })
    .then(res => res.json())
    .then(data => {
      updateBoard(data.calledNumbers);
    });
  }, 1000);

  if (isHost) {
    document.getElementById("callNumberBtn").onclick = () => {
      let num = Math.floor(Math.random() * 90) + 1;
      fetch(backendUrl, {
        method: "POST",
        body: JSON.stringify({ action: "callNumber", code: code, number: num })
      });
    };
  }
}

function renderBoard() {
  let board = document.getElementById("board");
  board.innerHTML = "";
  for (let i = 1; i <= 90; i++) {
    let div = document.createElement("div");
    div.className = "number";
    div.innerText = i;
    board.appendChild(div);
  }
}

function updateBoard(called) {
  document.querySelectorAll(".number").forEach(div => {
    if (called.includes(Number(div.innerText))) {
      div.classList.add("called");
    }
  });
  document.getElementById("lastNumbers").innerText = "Last 5: " + called.slice(-5).join(", ");
}

function renderTicket(ticket) {
  let html = "<table>";
  ticket.forEach(row => {
    html += "<tr>";
    row.forEach(cell => {
      html += `<td>${cell || ""}</td>`;
    });
    html += "</tr>";
  });
  html += "</table>";
  document.getElementById("ticket").innerHTML = html;
}
