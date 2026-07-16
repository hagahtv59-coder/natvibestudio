// Sends a single SMS through Arkesel. Runs on Vercel's servers so the API key
// never appears in the public website code (same pattern as api/db.js).

const ARKESEL_API_KEY = "TUJ3b1J6S21CUW1lRnFyRWt3TE4";
const ARKESEL_SENDER_ID = "NATVIBE-STD";
const ARKESEL_URL = "https://sms.arkesel.com/api/v2/sms/send";

// Converts whatever format the admin typed a Ghanaian number in
// (0XXXXXXXXX, 233XXXXXXXXX, +233XXXXXXXXX, with spaces/dashes, etc.)
// into the +233XXXXXXXXX format Arkesel expects.
function normalizeGhanaPhone(raw) {
  let digits = String(raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+233")) return digits;
  if (digits.startsWith("233")) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "+233" + digits.slice(1);
  if (digits.length === 9) return "+233" + digits; // e.g. 244000000 with no leading 0
  return digits.startsWith("+") ? digits : "+" + digits; // fallback: assume already has a country code
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "Method not allowed" }); return; }

  try {
    let body = req.body;
    if (typeof body === "string") { body = JSON.parse(body); }
    const phone = body && body.phone;
    const message = body && body.message;

    if (!phone || !message) {
      res.status(400).json({ ok: false, error: "Missing phone or message" });
      return;
    }

    const recipient = normalizeGhanaPhone(phone);

    const arkeselRes = await fetch(ARKESEL_URL, {
      method: "POST",
      headers: { "api-key": ARKESEL_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: ARKESEL_SENDER_ID,
        message: message,
        recipients: [recipient]
      })
    });

    const data = await arkeselRes.json().catch(() => ({}));

    if (!arkeselRes.ok || data.status !== "success") {
      res.status(200).json({ ok: false, error: data.message || data.status || ("HTTP " + arkeselRes.status), raw: data });
      return;
    }

    res.status(200).json({ ok: true, id: data.data && data.data.id, creditsUsed: data.data && data.data.credits_used });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
