import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://studyflow.app';

    if (!telegramBotToken) {
      return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN is not set.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find reminder preferences due for reminder
    const now = new Date().toISOString();
    const { data: prefs, error: prefError } = await supabase
      .from('reminder_preferences')
      .select('*, documents(*)')
      .eq('enabled', true)
      .lte('next_reminder_at', now);

    if (prefError) throw prefError;

    const results = [];

    for (const pref of (prefs || [])) {
      const doc = pref.documents;
      if (!doc || doc.status !== 'in_progress') continue;

      // Get progress
      const { data: progress } = await supabase
        .from('document_progress')
        .select('*')
        .eq('document_id', doc.id)
        .maybeSingle();

      const visitedRanges = progress?.visited_ranges || [];
      const totalPages = doc.total_pages || 1;
      const visitedCount = visitedRanges.reduce((sum: number, [a, b]: [number, number]) => sum + Math.max(0, b - a + 1), 0);
      const pct = Math.min(100, Math.round((visitedCount / totalPages) * 100));

      // Get active parking note if show_context is true
      let parkingText = '';
      if (pref.show_context) {
        const { data: parkingNote } = await supabase
          .from('notes')
          .select('note_text')
          .eq('document_id', doc.id)
          .eq('type', 'parking')
          .eq('is_active_parking', true)
          .maybeSingle();

        if (parkingNote) {
          parkingText = parkingNote.note_text;
        }
      }

      // Format deep link
      const deepLink = `${appBaseUrl}/reader/${doc.id}?page=${progress?.current_locator?.page || 1}&y=${progress?.current_locator?.y || 0}`;

      // Compose message
      let message = `📼 *${doc.title}*\nCuộn băng đang dừng ở ${pct}%.`;
      if (pref.show_context && parkingText) {
        message += `\n\nLần trước:\n“_${parkingText}_”`;
      }
      message += `\n\n▶ [Resume Reading](${deepLink})`;

      // Get telegram chat ID from settings or user metadata
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

      // Send via Telegram Bot API
      const tgRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '▶ Resume Reading', url: deepLink }],
              [{ text: '💤 Snooze 1 Day', callback_data: `snooze:${doc.id}:1` }]
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

      // Update next_reminder_at
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
