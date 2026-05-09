const statusEl = document.getElementById('status');
const sackBtn = document.getElementById('vote-sack');
const keepBtn = document.getElementById('vote-keep');
const sackCountEl = document.getElementById('sack-count');
const keepCountEl = document.getElementById('keep-count');
const sackPctEl = document.getElementById('sack-pct');
const keepPctEl = document.getElementById('keep-pct');
const barSack = document.getElementById('bar-sack');
const barKeep = document.getElementById('bar-keep');

async function fetchPoll() {
  try {
    const res = await fetch('/api/poll');
    const data = await res.json();
    renderPoll(data);
  } catch (err) {
    statusEl.textContent = 'Unable to load poll data. Please refresh.';
  }
}

function renderPoll(data) {
  const { sack, keep, total, sackPct, keepPct, hasVoted } = data;
  sackCountEl.textContent = sack;
  keepCountEl.textContent = keep;
  sackPctEl.textContent = `${sackPct}%`;
  keepPctEl.textContent = `${keepPct}%`;
  sackBtn.disabled = hasVoted;
  keepBtn.disabled = hasVoted;
  statusEl.textContent = hasVoted
    ? `You already voted. Total voters: ${total}.` 
    : `Total voters: ${total}. Pick one option below.`;
  barSack.style.width = `${sackPct}%`;
  barKeep.style.width = `${keepPct}%`;
}

async function castVote(choice) {
  sackBtn.disabled = true;
  keepBtn.disabled = true;
  statusEl.textContent = 'Submitting your vote...';

  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice }),
    });

    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || 'Could not submit vote.';
      sackBtn.disabled = false;
      keepBtn.disabled = false;
      return;
    }

    renderPoll({ ...data, hasVoted: true });
  } catch (err) {
    statusEl.textContent = 'Network error. Please try again.';
    sackBtn.disabled = false;
    keepBtn.disabled = false;
  }
}

sackBtn.addEventListener('click', () => castVote('sack'));
keepBtn.addEventListener('click', () => castVote('keep'));

fetchPoll();
