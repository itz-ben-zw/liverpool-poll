const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', true);
const dataPath = path.join(__dirname, 'data', 'votes.json');
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

async function readData() {
  try {
    const text = await fs.readFile(dataPath, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    return { sack: 0, keep: 0, voters: {} };
  }
}

async function writeData(data) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

function makeVoteKey(ip, cookieId) {
  if (cookieId) {
    return `cookie:${cookieId}`;
  }
  return `ip:${ip}`;
}

app.get('/api/poll', async (req, res) => {
  const data = await readData();
  const total = data.sack + data.keep;
  const sackPct = total ? Math.round((data.sack / total) * 100) : 0;
  const keepPct = total ? Math.round((data.keep / total) * 100) : 0;
  const voterId = req.cookies.poll_voter_id;
  const ipKey = `ip:${req.ip}`;
  const cookieKey = voterId ? `cookie:${voterId}` : null;
  const hasVoted = Boolean((cookieKey && data.voters[cookieKey]) || data.voters[ipKey]);

  res.json({
    sack: data.sack,
    keep: data.keep,
    total,
    sackPct,
    keepPct,
    hasVoted,
  });
});

app.post('/api/vote', async (req, res) => {
  const { choice } = req.body;
  if (!['sack', 'keep'].includes(choice)) {
    return res.status(400).json({ error: 'Invalid vote option.' });
  }

  const data = await readData();
  const voterCookieId = req.cookies.poll_voter_id;
  const ipKey = `ip:${req.ip}`;
  const cookieKey = voterCookieId ? `cookie:${voterCookieId}` : null;
  const hasVoteByCookie = cookieKey && data.voters[cookieKey];
  const hasVoteByIp = Boolean(data.voters[ipKey]);

  if (hasVoteByCookie || hasVoteByIp) {
    return res.status(403).json({ error: 'You have already voted.' });
  }

  data[choice] += 1;
  const voteRecord = {
    choice,
    when: new Date().toISOString(),
    ip: req.ip,
  };

  data.voters[ipKey] = voteRecord;

  if (cookieKey) {
    data.voters[cookieKey] = voteRecord;
  } else {
    const newCookie = crypto.randomUUID();
    res.cookie('poll_voter_id', newCookie, {
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });
    data.voters[`cookie:${newCookie}`] = voteRecord;
  }

  await writeData(data);

  const total = data.sack + data.keep;
  res.json({
    sack: data.sack,
    keep: data.keep,
    total,
    sackPct: Math.round((data.sack / total) * 100),
    keepPct: Math.round((data.keep / total) * 100),
  });
});

app.listen(PORT, () => {
  console.log(`Poll server running on http://localhost:${PORT}`);
});
