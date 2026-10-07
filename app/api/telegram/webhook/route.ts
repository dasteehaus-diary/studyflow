import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Telegram Webhook Handler for StudyFlow
 * Handles callback_query from inline buttons (e.g. Snooze 1 Day)
 */
export async function POST(req: Request) {
  try {
    const update = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 503 });
    }

    // Handle inline button callback query
    const callbackQuery = update?.callback_query;
    if (callbackQuery) {
      const data = String(callbackQuery.data || '');
      const callbackQueryId = callbackQuery.id;
      const chatId = callbackQuery.message?.chat?.id;

      if (data.startsWith('snooze:')) {
        const parts = data.split(':');
        const documentId = parts[1];
        const days = parseInt(parts[2] || '1', 10);

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        let confirmed = false;
        if (supabaseUrl && supabaseKey && documentId) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          const snoozeDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

          const { error } = await supabase
            .from('reminder_preferences')
            .update({
              snoozed_until: snoozeDate,
              updated_at: new Date().toISOString()
            })
            .eq('document_id', documentId);

          if (!error) confirmed = true;
        }

        // Answer callback query so Telegram app stops spinner
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQueryId,
            text: confirmed
              ? `💤 Đã hoãn nhắc ${days} ngày cho tài liệu này.`
              : `💤 Đã ghi nhận hoãn nhắc ${days} ngày.`,
            show_alert: false
          })
        });

        // Send confirmation note to chat
        if (chatId) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `💤 <b>Đã hoãn nhắc nhở ${days} ngày</b>.\nStudyFlow sẽ không gửi lời nhắc cho tài liệu này cho đến hết thời gian hoãn.`,
              parse_mode: 'HTML'
            })
          });
        }

        return NextResponse.json({ ok: true, snoozed: true, days });
      }
    }

    return NextResponse.json({ ok: true, handled: 'ignored' });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
