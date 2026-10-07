import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://studyflow-zeta-flame.vercel.app';

    if (!telegramBotToken) {
      return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN is not set.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const nowIso = now.toISOString();

    // Query active reminder preferences that are due
    const { data: prefs, error: prefError } = await supabase
      .from('reminder_preferences')
      .select('*, documents(*)')
      .eq('enabled', true)
      .lte('next_reminder_at', nowIso);

    if (prefError) throw prefError;

    const results = [];

    for (const pref of (prefs || [])) {
      const doc = pref.documents;
      // Strictly skip completed or archived documents
      if (!doc || doc.status !== 'in_progress') continue;

      // Check snooze condition: skip if snoozed_until is in the future
      if (pref.snoozed_until && new Date(pref.snoozed_until) > now) {
        continue;
      }

      // Anti-spam rule: do not send more than 1 reminder per document in < 20 hours
      const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from('reminder_logs')
        .select('id')
        .eq('document_id', doc.id)
        .eq('status', 'sent')
        .gte('sent_at', twentyHoursAgo)
        .limit(1);

      if (recentLogs && recentLogs.length > 0) {
        await supabase.from('reminder_logs').insert({
          user_id: pref.user_id,
          document_id: doc.id,
          status: 'skipped',
          detail: 'Anti-spam guard: reminder already sent in last 20 hours'
        });
        continue;
      }

      // Retrieve document progress
      const { data: progress } = await supabase
        .from('document_progress')
        .select('*')
        .eq('document_id', doc.id)
        .maybeSingle();

      const visitedRanges: Array<[number, number]> = progress?.visited_ranges || [];
      const totalPages = doc.total_pages || 1;
      const currentPage = progress?.current_locator?.page || 1;
      const currentY = progress?.current_locator?.y || 0;

      // Reading position percentage (based strictly on locator and totalPages)
      const clampedY = Math.max(0, Math.min(1, Number.isFinite(currentY) ? currentY : 0));
      const posFraction = ((Math.max(1, currentPage) - 1) + clampedY) / totalPages;
      const positionPercent = Math.max(0, Math.min(100, Math.round(posFraction * 1000) / 10));

      // Contextual thoughts: active parking note or unresolved question
      let contextualSnippet = '';
      if (pref.show_context) {
        // First priority: Active parking note
        const { data: parkingNote } = await supabase
          .from('notes')
          .select('note_text')
          .eq('document_id', doc.id)
          .eq('type', 'parking')
          .eq('is_active_parking', true)
          .maybeSingle();

        if (parkingNote?.note_text) {
          contextualSnippet = `\n\n📌 Lần trước bạn để lại:\n“<i>${escapeHtml(parkingNote.note_text.trim())}</i>”`;
        } else {
          // Second priority: Open unresolved question
          const { data: openQuestion } = await supabase
            .from('notes')
            .select('note_text')
            .eq('document_id', doc.id)
            .eq('type', 'question')
            .neq('status', 'resolved')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (openQuestion?.note_text) {
            contextualSnippet = `\n\n❓ Câu hỏi còn mở:\n“<i>${escapeHtml(openQuestion.note_text.trim())}</i>”`;
          }
        }
      }

      // Deep link to exact document, page, and scroll offset
      const deepLink = `${appBaseUrl}/reader/${doc.id}?page=${currentPage}&y=${currentY}`;

      // Compose contextual Vietnamese message (Page X / Y prioritized over position %)
      const message = [
        `📼 <b>${escapeHtml(doc.title || 'Tài liệu')}</b>`,
        '',
        `Bạn đang dừng ở <b>trang ${currentPage} / ${totalPages}</b>.`,
        `Vị trí đọc: khoảng ${positionPercent}%`,
        contextualSnippet,
        '',
        `▶ <a href="${escapeHtml(deepLink)}">Tiếp tục từ chỗ đang dở</a>`
      ].filter(Boolean).join('\n');

      // Get target chat ID
      const chatId = pref.telegram_chat_id || Deno.env.get('TELEGRAM_DEFAULT_CHAT_ID');
      if (!chatId) {
        await supabase.from('reminder_logs').insert({
          user_id: pref.user_id,
          document_id: doc.id,
          status: 'skipped',
          detail: 'No telegram chat_id configured'
        });
        continue;
      }

      // Send message via Telegram Bot API with deep link and snooze callback
      const tgRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '▶ Tiếp tục từ chỗ đang dở', url: deepLink }],
              [{ text: '💤 Hoãn 1 ngày', callback_data: `snooze:${doc.id}:1` }]
            ]
          }
        })
      });

      const tgData = await tgRes.json();
      const status = tgData.ok ? 'sent' : 'failed';

      await supabase.from('reminder_logs').insert({
        user_id: pref.user_id,
        document_id: doc.id,
        status,
        detail: tgData.ok ? 'Sent successfully' : JSON.stringify(tgData.description)
      });

      // Advance next_reminder_at to prevent infinite spam if user hasn't returned yet
      const intervalDays = pref.inactivity_days || 3;
      const nextDate = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('reminder_preferences')
        .update({ next_reminder_at: nextDate, updated_at: new Date().toISOString() })
        .eq('document_id', doc.id);

      results.push({ documentId: doc.id, status });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
