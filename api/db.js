// This runs on Vercel's servers, not the visitor's phone/browser.
// It exists because some mobile carriers interfere with "save" (PUT) requests
// made directly from a phone browser to JSONBin.io, even though normal page
// loads work fine. By doing the actual JSONBin reads/writes from here instead,
// the visitor's device only ever needs to do a simple same-site request to
// this endpoint, which carriers don't interfere with.

const MASTER_KEY = "$2a$10$VM15AZotifF2wcXou8VdceFnUd7te9hDc3wHD1gD8IPtKR8PGVHqm";
const MASTER_KEY_2 = "$2a$10$fEi2jZ47VxnreDHYK/N0p.EaCtczgFdc30kBdb.VwVp3mYRkZ8GCu";

const BIN_ID = "6a1e28f2f5f4af5e29aaa3d8";
const QUESTIONS_BIN_ID = "6a445305f5f4af5e294a4c2e";
const QUESTIONS_BIN_ID_2 = "6a420c3af5f4af5e293fdacc";
const QUESTIONS_BIN_ID_3 = "6a470e39f5f4af5e295738df";
const EXTRA_BIN_ID = "6a445241da38895dfe18b9f2";

const BIN_URL = "https://api.jsonbin.io/v3/b/" + BIN_ID;
const QUESTIONS_BIN_URL = "https://api.jsonbin.io/v3/b/" + QUESTIONS_BIN_ID;
const QUESTIONS_BIN_URL_2 = "https://api.jsonbin.io/v3/b/" + QUESTIONS_BIN_ID_2;
const QUESTIONS_BIN_URL_3 = "https://api.jsonbin.io/v3/b/" + QUESTIONS_BIN_ID_3;
const EXTRA_BIN_URL = "https://api.jsonbin.io/v3/b/" + EXTRA_BIN_ID;

function questionShard(guestName) {
  let h = 0;
  const s = String(guestName || "");
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return h % 3;
}

async function fetchBin(url, key, label) {
  const res = await fetch(url + "/latest", { headers: { "X-Master-Key": key }, cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(label + " HTTP " + res.status + ": " + t);
  }
  const data = await res.json();
  return data.record || {};
}

async function putBin(url, payload, key, label, failures) {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": key },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      failures.push(label + " (HTTP " + res.status + "): " + t);
    }
  } catch (e) {
    failures.push(label + " (network error): " + e.message);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  try {
    if (req.method === "GET") {
      const [core, q1, q2, q3, extra] = await Promise.all([
        fetchBin(BIN_URL, MASTER_KEY, "core"),
        fetchBin(QUESTIONS_BIN_URL, MASTER_KEY, "questions shard 1"),
        fetchBin(QUESTIONS_BIN_URL_2, MASTER_KEY_2, "questions shard 2"),
        fetchBin(QUESTIONS_BIN_URL_3, MASTER_KEY_2, "questions shard 3"),
        fetchBin(EXTRA_BIN_URL, MASTER_KEY, "extra")
      ]);
      const allQuestions = [].concat(q1.questions || [], q2.questions || [], q3.questions || []);
      const merged = Object.assign({}, core, extra);
      merged.questions = allQuestions;
      res.status(200).json({ ok: true, data: merged });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { body = JSON.parse(body); }
      const DB = body || {};

      const core = { accesses: DB.accesses || 0, guests: DB.guests || [], hiddenGuests: DB.hiddenGuests || [] };
      const allQuestions = DB.questions || [];
      const shard1 = [], shard2 = [], shard3 = [];
      allQuestions.forEach(q => {
        const s = questionShard(q.guest);
        if (s === 0) shard1.push(q); else if (s === 1) shard2.push(q); else shard3.push(q);
      });
      const extra = {
        schedules: DB.schedules || {}, gallery: DB.gallery || [], videos: DB.videos || [],
        guestApplications: DB.guestApplications || [], mediaPartners: DB.mediaPartners || [],
        sponsors: DB.sponsors || [], siteContent: DB.siteContent || {}, teamMembers: DB.teamMembers || [],
        checkins: DB.checkins || [], roleDuties: DB.roleDuties || {}, teamRoles: DB.teamRoles || []
      };

      const failures = [];
      await Promise.all([
        putBin(BIN_URL, core, MASTER_KEY, "core", failures),
        putBin(QUESTIONS_BIN_URL, { questions: shard1 }, MASTER_KEY, "questions shard 1", failures),
        putBin(QUESTIONS_BIN_URL_2, { questions: shard2 }, MASTER_KEY_2, "questions shard 2", failures),
        putBin(QUESTIONS_BIN_URL_3, { questions: shard3 }, MASTER_KEY_2, "questions shard 3", failures),
        putBin(EXTRA_BIN_URL, extra, MASTER_KEY, "extra", failures)
      ]);

      if (failures.length) {
        res.status(200).json({ ok: false, failures });
      } else {
        res.status(200).json({ ok: true });
      }
      return;
    }

    res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
