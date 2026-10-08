/* Games: invite a friend, they accept, decline or don't answer (the invite lapses after 4 minutes) */
const GAME_INFO = { tictactoe: ["Tic-tac-toe", "Three in a row wins. You take turns."], rps: ["Rock Paper Scissors", "First to win two rounds."] };
let pickedGame = "tictactoe", game = null;
const gstat = (t) => { $("gameStatus").textContent = t; };

function renderGames() {
  const cards = $("gameCards"); cards.innerHTML = "";
  for (const [id, [title, text]] of Object.entries(GAME_INFO)) {
    const b = document.createElement("button"); b.className = "gcard" + (id === pickedGame ? " on" : ""); b.innerHTML = "<b></b><span></span>";
    b.firstChild.textContent = title; b.lastChild.textContent = text; b.onclick = () => { pickedGame = id; renderGames(); }; cards.appendChild(b);
  }
  const list = $("gameFriends"); list.innerHTML = "";
  const fr = [...friends.values()].filter((f) => !f.group);
  if (!fr.length) { const p = document.createElement("p"); p.className = "hint"; p.textContent = "Add a friend first, then you can invite them to play."; list.appendChild(p); }
  fr.forEach((f) => {
    const row = document.createElement("div"); row.className = "frow";
    const t = document.createElement("div"); t.className = "t"; t.textContent = f.name + (f.online ? "" : " (offline)");
    const b = document.createElement("button"); b.className = "small"; b.textContent = "Invite"; b.disabled = !f.online;
    b.onclick = () => socket.emit("game:invite", { to: f.id, type: pickedGame }, (res) => gstat(res.ok ? `Invite sent to ${f.name}. They have 4 minutes to answer.` : res.error));
    row.append(avEl(f.name, f.avatar, "sm"), t, b); list.appendChild(row);
  });
}

socket.on("game:invited", ({ id, name, type }) => {
  card("g:" + id, `${name} invited you to play ${type}. The invite lasts 4 minutes.`, () => socket.emit("game:respond", { id, accept: true }), () => socket.emit("game:respond", { id, accept: false }));
  toast(`${name} invited you to play ${type}.`); if (prefs.sound) beep();
});
socket.on("game:expired", ({ id }) => { dropCard("g:" + id); toast("A game invite ran out of time."); });
socket.on("game:declined", ({ name, type }) => { const t = `${name} declined your ${type} invite.`; gstat(t); toast(t); });
socket.on("game:timeout", ({ name, type }) => { const t = `${name} didn't respond to your ${type} invite, so it was cancelled.`; gstat(t); toast(t); });
socket.on("game:ended", ({ name }) => { closeGame(); toast(`${name} left the game.`); });
socket.on("game:state", (g) => { game = g; renderGame(); });

function closeGame() { game = null; $("gameModal").hidden = true; }
$("gameQuit").onclick = () => { if (game) socket.emit("game:quit", { id: game.id }); closeGame(); };

function renderGame() {
  const g = game, body = $("gameBody"); body.innerHTML = "";
  $("gameTitle").textContent = `${g.title} with ${g.opponent}`; $("gameModal").hidden = false;
  $("gameQuit").textContent = g.winner ? "Close" : "Leave game";
  const st = document.createElement("div"); st.className = "gstat";
  if (g.type === "tictactoe") {
    const grid = document.createElement("div"); grid.id = "tttGrid";
    g.board.forEach((c, i) => {
      const b = document.createElement("button"); b.textContent = c; b.disabled = !!c || g.turn !== g.you || !!g.winner;
      b.onclick = () => socket.emit("game:move", { id: g.id, move: i }); grid.appendChild(b);
    });
    body.appendChild(grid);
    st.textContent = g.winner ? (g.winner === "draw" ? "It's a draw." : g.winner === g.you ? "You won." : `${g.opponent} won.`)
      : g.turn === g.you ? `Your turn (${g.marks[g.you]})` : `Waiting for ${g.opponent}...`;
  } else {
    const oppId = Object.keys(g.scores).find((k) => k !== g.you);
    const score = document.createElement("div"); score.className = "gstat"; score.textContent = `You ${g.scores[g.you]} - ${g.scores[oppId]} ${g.opponent}  (round ${g.round})`; body.appendChild(score);
    const row = document.createElement("div"); row.className = "rps";
    ["rock", "paper", "scissors"].forEach((m) => {
      const b = document.createElement("button"); b.textContent = m[0].toUpperCase() + m.slice(1); b.className = "ghost"; b.disabled = !!g.winner || g.picked[g.you];
      b.onclick = () => socket.emit("game:move", { id: g.id, move: m }); row.appendChild(b);
    });
    body.appendChild(row);
    if (g.last) { const l = document.createElement("div"); l.className = "gstat"; l.textContent = `Last round: you played ${g.last.picks[g.you]}, ${g.opponent} played ${g.last.picks[oppId]}. ${g.last.winner ? (g.last.winner === g.you ? "You won it." : `${g.opponent} won it.`) : "A tie."}`; body.appendChild(l); }
    st.textContent = g.winner ? (g.winner === g.you ? "You won the match." : `${g.opponent} won the match.`) : g.picked[g.you] ? `Waiting for ${g.opponent} to choose...` : "Choose rock, paper or scissors.";
  }
  body.appendChild(st);
}
