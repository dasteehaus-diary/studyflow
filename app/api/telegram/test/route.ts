import { NextResponse } from 'next/server';

export async function GET() {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return NextResponse.json({ configured });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chatId = body?.chatId?.toString().trim();

    if (!chatId) {
      return NextResponse.json(
        { ok: false, error: 'Vui lòng cung cấp Telegram Chat ID.' },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Telegram chưa được kết nối. Biến môi trường TELEGRAM_BOT_TOKEN chưa được thiết lập trên server.'
        },
        { status: 503 }
      );
    }

    const escapeHtml = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const message = [
      '📼 <b>StudyFlow — Kiểm tra kết nối</b>',
      '',
      `Tin nhắn thử nghiệm đã gửi thành công tới Chat ID <code>${escapeHtml(chatId)}</code>!`,
      '',
      'Khi bạn tạm dừng đọc quá số ngày đã cài đặt, StudyFlow sẽ tự động gửi thông báo kèm dòng suy nghĩ (Parking Note) và vị trí trang đọc chính xác để bạn dễ dàng tiếp tục.'
    ].join('\n');

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: data.description || 'Lỗi khi gửi tin nhắn qua Telegram Bot API.'
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Đã gửi tin nhắn thử nghiệm thành công qua Telegram!'
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Lỗi hệ thống khi kết nối Telegram.'
      },
      { status: 500 }
    );
  }
}
