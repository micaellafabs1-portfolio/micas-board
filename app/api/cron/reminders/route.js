import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// This route is called daily by Vercel Cron (see vercel.json).
// It checks for cards due today or tomorrow and sends email reminders
// to micaellafabian@gmail.com via Resend.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  // Security: verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const TO_EMAIL = 'micaellafabian@gmail.com';

  if (!RESEND_API_KEY) {
    console.error('Missing RESEND_API_KEY environment variable');
    return new Response('Missing RESEND_API_KEY', { status: 500 });
  }

  // Today and tomorrow in YYYY-MM-DD (UTC)
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  // Fetch cards due today or tomorrow
  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, title, due_date, label, list_id')
    .in('due_date', [today, tomorrow]);

  if (error) {
    console.error('Supabase error:', error);
    return new Response('Database error', { status: 500 });
  }

  if (!cards || cards.length === 0) {
    return new Response(JSON.stringify({ message: 'No upcoming deadlines', sent: 0 }), { status: 200 });
  }

  // Build email
  const todayCards = cards.filter(c => c.due_date === today);
  const tomorrowCards = cards.filter(c => c.due_date === tomorrow);

  function cardRow(card) {
    return `<tr style="border-bottom:1px solid #272E3A;">
      <td style="padding:10px 12px;color:#E6E9EF;">${card.title}</td>
      <td style="padding:10px 12px;color:#FF5C5C;font-weight:600;">${card.due_date}</td>
      <td style="padding:10px 12px;color:#7C8798;">${card.label !== 'None' ? card.label : '—'}</td>
    </tr>`;
  }

  const htmlBody = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0E1116;color:#E6E9EF;padding:32px;border-radius:12px;max-width:600px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
        <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#3B9EFF,#7C5CFF);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:15px;">M</div>
        <span style="font-size:18px;font-weight:700;">Mica's Board — Deadline Reminder</span>
      </div>

      ${todayCards.length > 0 ? `
        <div style="margin-bottom:24px;">
          <div style="font-size:15px;font-weight:600;color:#FF5C5C;margin-bottom:12px;">🔴 Due Today (${today})</div>
          <table style="width:100%;border-collapse:collapse;background:#161B22;border-radius:8px;overflow:hidden;">
            <thead><tr style="background:#1B212B;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#7C8798;font-weight:600;letter-spacing:.5px;">CARD</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#7C8798;font-weight:600;letter-spacing:.5px;">DUE DATE</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#7C8798;font-weight:600;letter-spacing:.5px;">LABEL</th>
            </tr></thead>
            <tbody>${todayCards.map(cardRow).join('')}</tbody>
          </table>
        </div>
      ` : ''}

      ${tomorrowCards.length > 0 ? `
        <div style="margin-bottom:24px;">
          <div style="font-size:15px;font-weight:600;color:#FFA64D;margin-bottom:12px;">🟡 Due Tomorrow (${tomorrow})</div>
          <table style="width:100%;border-collapse:collapse;background:#161B22;border-radius:8px;overflow:hidden;">
            <thead><tr style="background:#1B212B;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#7C8798;font-weight:600;letter-spacing:.5px;">CARD</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#7C8798;font-weight:600;letter-spacing:.5px;">DUE DATE</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#7C8798;font-weight:600;letter-spacing:.5px;">LABEL</th>
            </tr></thead>
            <tbody>${tomorrowCards.map(cardRow).join('')}</tbody>
          </table>
        </div>
      ` : ''}

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #272E3A;font-size:12px;color:#4D5566;">
        This is an automated reminder from Mica's Board. 
        <a href="https://micas-board.vercel.app" style="color:#3B9EFF;text-decoration:none;">Open the board →</a>
      </div>
    </div>
  `;

  // Send via Resend
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mica\'s Board <reminders@micas-board.resend.dev>',
      to: [TO_EMAIL],
      subject: `📋 Mica's Board — ${todayCards.length} due today, ${tomorrowCards.length} due tomorrow`,
      html: htmlBody,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    console.error('Resend error:', err);
    return new Response(`Resend error: ${err}`, { status: 500 });
  }

  const result = await resendRes.json();
  console.log('Email sent:', result.id);
  return new Response(JSON.stringify({ message: 'Email sent', id: result.id, cardsCount: cards.length }), { status: 200 });
}
