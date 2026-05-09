const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const app = express();
app.set('trust proxy', true);
const dataPath = path.join(__dirname, 'data', 'votes.json');
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || null;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

async function createDbClient() {
  if (!DATABASE_URL) return null;

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS votes (
      choice text PRIMARY KEY,
      count integer NOT NULL
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS voters (
      voter_key text PRIMARY KEY,
      choice text NOT NULL,
      voted_at timestamptz NOT NULL DEFAULT now(),
      ip text
    );
  `);

  for (const choice of ['sack', 'keep']) {
    await client.query(
      `INSERT INTO votes(choice, count) VALUES ($1, 0) ON CONFLICT (choice) DO NOTHING;`,
      [choice]
    );
  }

  return client;
}

async function getDbClient() {
  if (!DATABASE_URL) return null;
  if (!app.locals.dbClient) {
    app.locals.dbClient = await createDbClient();
  }
  return app.locals.dbClient;
}

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

async function getCounts() {
  const db = await getDbClient();
  if (!db) {
    return readData();
  }

  const result = await db.query('SELECT choice, count FROM votes');
  const counts = { sack: 0, keep: 0 };
  result.rows.forEach(row => {
    counts[row.choice] = row.count;
  });
  return { sack: counts.sack, keep: counts.keep, voters: {} };
}

async function getVote(key) {
  const db = await getDbClient();
  if (!db) {
    const data = await readData();
    return data.voters[key];
  }

  const result = await db.query('SELECT voter_key FROM voters WHERE voter_key = $1', [key]);
  return result.rowCount > 0 ? result.rows[0] : null;
}

async function recordVote(choice, voteKey, ip) {
  const db = await getDbClient();
  const voteRecord = {
    choice,
    when: new Date().toISOString(),
    ip,
  };

  if (!db) {
    const data = await readData();
    data[choice] += 1;
    data.voters[voteKey] = voteRecord;
    await writeData(data);
    return;
  }

  await db.query('BEGIN');
  try {
    await db.query('UPDATE votes SET count = count + 1 WHERE choice = $1', [choice]);
    await db.query(
      'INSERT INTO voters(voter_key, choice, ip) VALUES ($1, $2, $3)',
      [voteKey, choice, ip]
    );
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

function makeVoteKey(ip, cookieId) {
  if (cookieId) {
    return `cookie:${cookieId}`;
  }
  return `ip:${ip}`;
}

app.get('/api/poll', async (req, res) => {
  const data = await getCounts();
  const total = data.sack + data.keep;
  const sackPct = total ? Math.round((data.sack / total) * 100) : 0;
  const keepPct = total ? Math.round((data.keep / total) * 100) : 0;
  const voterId = req.cookies.poll_voter_id;
  const ipKey = makeVoteKey(req.ip, null);
  const cookieKey = voterId ? makeVoteKey(null, voterId) : null;
  const hasVoted = Boolean(
    (cookieKey && (await getVote(cookieKey))) || (await getVote(ipKey))
  );

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

  const voterCookieId = req.cookies.poll_voter_id;
  const ipKey = makeVoteKey(req.ip, null);
  const cookieKey = voterCookieId ? makeVoteKey(null, voterCookieId) : null;
  const hasVoteByCookie = cookieKey && (await getVote(cookieKey));
  const hasVoteByIp = Boolean(await getVote(ipKey));

  if (hasVoteByCookie || hasVoteByIp) {
    return res.status(403).json({ error: 'You have already voted.' });
  }

  const voteKey = cookieKey || ipKey;

  if (!cookieKey) {
    const newCookie = crypto.randomUUID();
    res.cookie('poll_voter_id', newCookie, {
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });
    await recordVote(choice, makeVoteKey(null, newCookie), req.ip);
  } else {
    await recordVote(choice, voteKey, req.ip);
  }

  const data = await getCounts();
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
