// Runs automatically once a day via Vercel Cron (see vercel.json), and can
// also be triggered manually (e.g. from the admin dashboard's "Run Check Now"
// button) for testing. Checks the scheduledSms list for anything due today
// that hasn't been sent yet, sends it through Arkesel, and marks it sent.
//
// Ghana runs on UTC year-round (no timezone offset, no DST), so comparing
// plain "YYYY-MM-DD" date strings against the server's UTC date is accurate.

const MASTER_KEY = "$2a$10$VM15AZotifF2wcXou8VdceFnUd7te9hDc3wHD1gD8IPtKR8PGVHqm";
const EXTRA_BIN_ID = "6a445241da38895dfe18b9f2";
const EXTRA_BIN_URL = "https://api.jsonbin.io/v3/b/" + EXTRA_BIN_ID;

const ARKESEL_API_KEY = "TUJ3b1J6S21CUW1lRnFyRWt3TE4";
const ARKESEL_SENDER_ID = "NATVIBE-STD";
const ARKESEL_URL = "https://sms.arkesel.com/api/v2/sms/send";

function normalizeGhanaPhone(raw) {
  let digits = String(raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+233")) return digits;
  if (digits.startsWith("233")) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "+233" + digits.slice(1);
  if (digits.length === 9) return "+233" + digits;
  return digits.startsWith("+") ? digits : "+" + digits;
}

async function sendOneSms(phone, message) {
  const res = await fetch(ARKESEL_URL, {
    method: "POST",
    headers: { "api-key": ARKESEL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: ARKESEL_SENDER_ID, message, recipients: [normalizeGhanaPhone(phone)] })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== "success") {
    throw new Error(data.message || data.status || ("HTTP " + res.status));
  }
  return data;
}

module.exports = async (req, res) => {
  // Vercel automatically sends this header on real cron invocations once
  // CRON_SECRET exists as a project env var. If it's not set yet, we skip
  // this check rather than lock everyone out — it becomes protected as soon
  // as Vercel provisions it after the first deploy with a crons entry.
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== "Bearer " + process.env.CRON_SECRET) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
  }

  try {
    const getRes = await fetch(EXTRA_BIN_URL + "/latest", { headers: { "X-Master-Key": MASTER_KEY }, cache: "no-store" });
    if (!getRes.ok) throw new Error("Could not load data: HTTP " + getRes.status);
    const getJson = await getRes.json();
    const record = getJson.record || {};
    const list = record.scheduledSms || [];

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC == Ghana time

    const sent = [], failed = [];
    for (const item of list) {
      if (item.sent) continue;
      if (!item.sendDate || item.sendDate > todayStr) continue; // not due yet
      try {
        await sendOneSms(item.phone, item.message);
        item.sent = true;
        item.sentAt = new Date().toISOString();
        sent.push(item.guest || item.phone);
      } catch (e) {
        item.lastError = e.message;
        failed.push({ guest: item.guest || item.phone, error: e.message });
      }
    }

    if (sent.length || failed.length) {
      record.scheduledSms = list;
      const putRes = await fetch(EXTRA_BIN_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Master-Key": MASTER_KEY },
        body: JSON.stringify(record)
      });
      if (!putRes.ok) throw new Error("Sent messages, but failed to save updated status: HTTP " + putRes.status);
    }

    res.status(200).json({ ok: true, checked: list.length, sent, failed, ranAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
