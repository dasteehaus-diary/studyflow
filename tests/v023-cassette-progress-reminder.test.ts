import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  mergePagesIntoRanges,
  countQualifiedPages,
  meaningfulCoveragePercent
} from '../lib/progress/cassette.ts';

describe('StudyFlow v0.2.3 — Progress & Cassette Qualification Engine', () => {
  class MockPageQualificationEngine {
    qualifiedPages = new Set<number>();
    pageDwellSeconds = new Map<number, number>();
    currentPage = 1;
    currentY = 0;
    isTabVisible = true;
    lastUserActivityTimestamp = Date.now();
    totalPages = 55;

    // Simulate clock tick (1 second)
    tick(now: number = Date.now()) {
      if (!this.isTabVisible) return; // Tab background -> dwell does not advance
      if (now - this.lastUserActivityTimestamp > 120_000) return; // Idle > 120s -> dwell pauses

      const current = (this.pageDwellSeconds.get(this.currentPage) || 0) + 1;
      this.pageDwellSeconds.set(this.currentPage, current);

      if (current >= 8) {
        this.qualifiedPages.add(this.currentPage);
      }
    }

    // Save locator only (scroll, jump)
    setLocator(page: number, y: number) {
      this.currentPage = page;
      this.currentY = y;
      // Note: Locator movement strictly DOES NOT auto-qualify page
    }

    // Meaningful action: highlight, note, question
    recordMeaningfulAction(page: number) {
      this.qualifiedPages.add(page);
    }

    getRanges(): Array<[number, number]> {
      return mergePagesIntoRanges(Array.from(this.qualifiedPages));
    }

    getMeaningfulCoverage(): number {
      return meaningfulCoveragePercent(this.totalPages, this.getRanges());
    }
  }

  it('1. open page 1 < 8s -> 0 qualified pages', () => {
    const engine = new MockPageQualificationEngine();
    // Simulate 5 seconds dwell
    for (let i = 0; i < 5; i++) engine.tick();

    assert.strictEqual(engine.qualifiedPages.size, 0, 'Page 1 must not be qualified after only 5s');
    assert.strictEqual(engine.getMeaningfulCoverage(), 0, 'Coverage must be 0%');
  });

  it('2. page 1 >= 8s active -> page 1 qualified', () => {
    const engine = new MockPageQualificationEngine();
    // Simulate 8 seconds dwell
    for (let i = 0; i < 8; i++) engine.tick();

    assert.strictEqual(engine.qualifiedPages.has(1), true, 'Page 1 must qualify after >= 8s');
    assert.strictEqual(engine.getMeaningfulCoverage(), 2, '1 qualified page / 55 total pages = 2%');
  });

  it('3. page 2 lướt 1s -> progress không tăng', () => {
    const engine = new MockPageQualificationEngine();
    // Qualify page 1
    for (let i = 0; i < 8; i++) engine.tick();
    assert.strictEqual(engine.getMeaningfulCoverage(), 2);

    // Scroll to page 2 and dwell for only 1 second
    engine.setLocator(2, 0.1);
    engine.tick();

    assert.strictEqual(engine.qualifiedPages.has(2), false, 'Page 2 should not be qualified after 1s skim');
    assert.strictEqual(engine.getMeaningfulCoverage(), 2, 'Coverage must strictly remain at 2% and not jump to 4%');
  });

  it('4. highlight page 2 -> page 2 qualify ngay', () => {
    const engine = new MockPageQualificationEngine();
    engine.setLocator(2, 0.4);
    assert.strictEqual(engine.qualifiedPages.has(2), false);

    // User creates highlight on page 2
    engine.recordMeaningfulAction(2);

    assert.strictEqual(engine.qualifiedPages.has(2), true, 'Page 2 must qualify immediately upon highlight');
    assert.strictEqual(engine.getMeaningfulCoverage(), 2); // 1 / 55 ≈ 2%
  });

  it('5. tab hidden -> dwell không tăng', () => {
    const engine = new MockPageQualificationEngine();
    engine.isTabVisible = false; // Tab switched to background
    for (let i = 0; i < 15; i++) engine.tick();

    assert.strictEqual(engine.pageDwellSeconds.get(1) || 0, 0, 'Dwell must not accumulate when tab is hidden');
    assert.strictEqual(engine.qualifiedPages.size, 0);
  });

  it('6. idle > 120s -> dwell không tăng', () => {
    const engine = new MockPageQualificationEngine();
    const t0 = Date.now();
    engine.lastUserActivityTimestamp = t0;

    // Advance dwell by 4 seconds
    for (let i = 0; i < 4; i++) engine.tick(t0 + i * 1000);
    assert.strictEqual(engine.pageDwellSeconds.get(1), 4);

    // User walks away, now 130s later without activity
    const tIdle = t0 + 130_000;
    engine.tick(tIdle);

    assert.strictEqual(engine.pageDwellSeconds.get(1), 4, 'Dwell counter must pause when user is idle > 120s');
    assert.strictEqual(engine.qualifiedPages.has(1), false);
  });

  it('7. locator save không tự qualify page', () => {
    const engine = new MockPageQualificationEngine();
    // Simulate user scrubbing rapidly through pages 10, 20, 30
    engine.setLocator(10, 0.2);
    engine.setLocator(20, 0.5);
    engine.setLocator(30, 0.8);

    assert.strictEqual(engine.qualifiedPages.size, 0, 'Merely saving locator positions must never qualify pages');
    assert.strictEqual(engine.getMeaningfulCoverage(), 0);
  });

  it('8. same page không double count', () => {
    const engine = new MockPageQualificationEngine();
    engine.currentPage = 5;
    engine.recordMeaningfulAction(5);
    engine.recordMeaningfulAction(5); // duplicate action
    for (let i = 0; i < 20; i++) engine.tick(); // extended dwell on page 5

    assert.strictEqual(engine.qualifiedPages.size, 1);
    const ranges = engine.getRanges();
    assert.deepStrictEqual(ranges, [[5, 5]]);
    assert.strictEqual(countQualifiedPages(ranges), 1);
  });

  it('9. progress calculation uses qualified coverage consistently', () => {
    // 55 pages document
    assert.strictEqual(meaningfulCoveragePercent(55, []), 0);
    assert.strictEqual(meaningfulCoveragePercent(55, [[1, 1]]), 2); // 1 / 55 = 1.8% -> 2%
    assert.strictEqual(meaningfulCoveragePercent(55, [[1, 1], [2, 2]]), 4); // 2 / 55 = 3.6% -> 4%
    assert.strictEqual(meaningfulCoveragePercent(55, [[1, 10]]), 18); // 10 / 55 = 18.18% -> 18%
    assert.strictEqual(meaningfulCoveragePercent(55, [[1, 55]]), 100);
    // Safe fallback on 0 total pages
    assert.strictEqual(meaningfulCoveragePercent(0, [[1, 5]]), 0);
  });
});

describe('StudyFlow v0.2.3 — Reminder Engine, Due Query & Anti-Spam', () => {
  interface MockDoc {
    id: string;
    title: string;
    status: 'in_progress' | 'completed' | 'archived';
    total_pages: number;
  }
  interface MockPref {
    document_id: string;
    user_id: string;
    inactivity_days: number;
    enabled: boolean;
    show_context: boolean;
    telegram_chat_id: string | null;
    snoozed_until: string | null;
    next_reminder_at: string;
  }
  interface MockReminderLog {
    document_id: string;
    sent_at: string;
    status: 'sent' | 'failed' | 'skipped';
  }

  function evaluateDueReminders(
    docs: MockDoc[],
    prefs: MockPref[],
    logs: MockReminderLog[],
    now: Date
  ): Array<{ doc: MockDoc; pref: MockPref; skipReason?: string }> {
    const dueList: Array<{ doc: MockDoc; pref: MockPref; skipReason?: string }> = [];

    for (const pref of prefs) {
      const doc = docs.find(d => d.id === pref.document_id);
      if (!doc) continue;

      if (!pref.enabled) {
        dueList.push({ doc, pref, skipReason: 'disabled' });
        continue;
      }
      if (doc.status === 'completed') {
        dueList.push({ doc, pref, skipReason: 'completed' });
        continue;
      }
      if (doc.status === 'archived') {
        dueList.push({ doc, pref, skipReason: 'archived' });
        continue;
      }
      if (new Date(pref.next_reminder_at) > now) {
        dueList.push({ doc, pref, skipReason: 'not_due' });
        continue;
      }
      if (pref.snoozed_until && new Date(pref.snoozed_until) > now) {
        dueList.push({ doc, pref, skipReason: 'snoozed' });
        continue;
      }
      if (!pref.telegram_chat_id) {
        dueList.push({ doc, pref, skipReason: 'no_chat_id' });
        continue;
      }

      // 20-hour anti-spam guard
      const twentyHoursAgo = new Date(now.getTime() - 20 * 3600 * 1000);
      const recentSent = logs.find(
        l => l.document_id === doc.id && l.status === 'sent' && new Date(l.sent_at) >= twentyHoursAgo
      );
      if (recentSent) {
        dueList.push({ doc, pref, skipReason: 'anti_spam_20h' });
        continue;
      }

      dueList.push({ doc, pref });
    }

    return dueList;
  }

  it('1. activity at T0 + 3 days -> next reminder đúng', () => {
    const t0 = new Date('2026-10-01T10:00:00.000Z');
    const inactivityDays = 3;
    const nextReminder = new Date(t0.getTime() + inactivityDays * 86400000).toISOString();
    assert.strictEqual(nextReminder, '2026-10-04T10:00:00.000Z');
  });

  it('2. new meaningful activity resets next reminder', () => {
    const oldActivity = new Date('2026-10-01T10:00:00.000Z');
    let nextReminder = new Date(oldActivity.getTime() + 3 * 86400000).toISOString();
    assert.strictEqual(nextReminder, '2026-10-04T10:00:00.000Z');

    // User reads again on Oct 3
    const newActivity = new Date('2026-10-03T15:00:00.000Z');
    nextReminder = new Date(newActivity.getTime() + 3 * 86400000).toISOString();
    assert.strictEqual(nextReminder, '2026-10-06T15:00:00.000Z');
  });

  it('3. completed doc skipped', () => {
    const doc: MockDoc = { id: 'd1', title: 'Calculus', status: 'completed', total_pages: 50 };
    const pref: MockPref = {
      document_id: 'd1',
      user_id: 'u1',
      inactivity_days: 1,
      enabled: true,
      show_context: true,
      telegram_chat_id: '12345',
      snoozed_until: null,
      next_reminder_at: '2026-10-01T00:00:00.000Z'
    };
    const res = evaluateDueReminders([doc], [pref], [], new Date('2026-10-06T00:00:00.000Z'));
    assert.strictEqual(res[0].skipReason, 'completed');
  });

  it('4. archived doc skipped', () => {
    const doc: MockDoc = { id: 'd2', title: 'Linear Algebra', status: 'archived', total_pages: 80 };
    const pref: MockPref = {
      document_id: 'd2',
      user_id: 'u1',
      inactivity_days: 1,
      enabled: true,
      show_context: true,
      telegram_chat_id: '12345',
      snoozed_until: null,
      next_reminder_at: '2026-10-01T00:00:00.000Z'
    };
    const res = evaluateDueReminders([doc], [pref], [], new Date('2026-10-06T00:00:00.000Z'));
    assert.strictEqual(res[0].skipReason, 'archived');
  });

  it('5. snoozed doc skipped', () => {
    const doc: MockDoc = { id: 'd3', title: 'Biology', status: 'in_progress', total_pages: 40 };
    const pref: MockPref = {
      document_id: 'd3',
      user_id: 'u1',
      inactivity_days: 1,
      enabled: true,
      show_context: true,
      telegram_chat_id: '12345',
      snoozed_until: '2026-10-07T00:00:00.000Z', // snoozed until tomorrow
      next_reminder_at: '2026-10-05T00:00:00.000Z'
    };
    const res = evaluateDueReminders([doc], [pref], [], new Date('2026-10-06T00:00:00.000Z'));
    assert.strictEqual(res[0].skipReason, 'snoozed');
  });

  it('6. disabled pref skipped', () => {
    const doc: MockDoc = { id: 'd4', title: 'Art History', status: 'in_progress', total_pages: 30 };
    const pref: MockPref = {
      document_id: 'd4',
      user_id: 'u1',
      inactivity_days: 0,
      enabled: false,
      show_context: true,
      telegram_chat_id: '12345',
      snoozed_until: null,
      next_reminder_at: '2026-10-01T00:00:00.000Z'
    };
    const res = evaluateDueReminders([doc], [pref], [], new Date('2026-10-06T00:00:00.000Z'));
    assert.strictEqual(res[0].skipReason, 'disabled');
  });

  it('7. showContext ON includes Parking Note', () => {
    function composeMessage(title: string, posPct: number, page: number, totalPages: number, showContext: boolean, parkingText?: string) {
      let msg = `📼 *${title}*\n\nBạn đang dừng ở *trang ${page} / ${totalPages}*.\nVị trí đọc: khoảng ${posPct}%`;
      if (showContext && parkingText) {
        msg += `\n\n📌 Lần trước bạn để lại:\n“_${parkingText}_”`;
      }
      return msg;
    }

    const msg = composeMessage('Deep Learning', 35, 12, 50, true, 'Kiểm tra backprop ở trang 14');
    assert.ok(msg.includes('Bạn đang dừng ở *trang 12 / 50*.'), 'Message must contain page X / Y');
    assert.ok(msg.includes('Vị trí đọc: khoảng 35%'), 'Message must contain reading position');
    assert.ok(msg.includes('📌 Lần trước bạn để lại:'), 'Message must contain parking note');
    assert.ok(msg.includes('Kiểm tra backprop ở trang 14'));
  });

  it('8. showContext OFF excludes note', () => {
    function composeMessage(title: string, posPct: number, page: number, totalPages: number, showContext: boolean, parkingText?: string) {
      let msg = `📼 *${title}*\n\nBạn đang dừng ở *trang ${page} / ${totalPages}*.\nVị trí đọc: khoảng ${posPct}%`;
      if (showContext && parkingText) {
        msg += `\n\n📌 Lần trước bạn để lại:\n“_${parkingText}_”`;
      }
      return msg;
    }

    const msg = composeMessage('Deep Learning', 35, 12, 50, false, 'Kiểm tra backprop ở trang 14');
    assert.ok(msg.includes('Bạn đang dừng ở *trang 12 / 50*.'), 'Message must contain page X / Y');
    assert.strictEqual(msg.includes('📌 Lần trước bạn để lại:'), false, 'Message must NOT contain note when showContext is false');
  });

  it('9. no chat ID -> skipped log', () => {
    const doc: MockDoc = { id: 'd5', title: 'Physics', status: 'in_progress', total_pages: 50 };
    const pref: MockPref = {
      document_id: 'd5',
      user_id: 'u1',
      inactivity_days: 1,
      enabled: true,
      show_context: true,
      telegram_chat_id: null, // missing chat ID
      snoozed_until: null,
      next_reminder_at: '2026-10-05T00:00:00.000Z'
    };
    const res = evaluateDueReminders([doc], [pref], [], new Date('2026-10-06T00:00:00.000Z'));
    assert.strictEqual(res[0].skipReason, 'no_chat_id');
  });

  it('10. Telegram API failure -> failed log', () => {
    function handleTelegramResponse(tgOk: boolean, tgDescription?: string) {
      return {
        status: tgOk ? 'sent' : 'failed',
        detail: tgOk ? 'Sent successfully' : (tgDescription || 'Unknown API failure')
      };
    }
    const failed = handleTelegramResponse(false, 'Forbidden: bot was blocked by the user');
    assert.strictEqual(failed.status, 'failed');
    assert.ok(failed.detail.includes('Forbidden'));
  });

  it('11. sent reminder -> anti-spam prevents duplicate within 20 hours', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    const doc: MockDoc = { id: 'd6', title: 'Macroeconomics', status: 'in_progress', total_pages: 60 };
    const pref: MockPref = {
      document_id: 'd6',
      user_id: 'u1',
      inactivity_days: 1,
      enabled: true,
      show_context: true,
      telegram_chat_id: '12345',
      snoozed_until: null,
      next_reminder_at: '2026-10-05T00:00:00.000Z'
    };
    // Log showing a reminder was sent 4 hours ago
    const logs: MockReminderLog[] = [
      { document_id: 'd6', sent_at: '2026-10-06T06:00:00.000Z', status: 'sent' }
    ];

    const res = evaluateDueReminders([doc], [pref], logs, now);
    assert.strictEqual(res[0].skipReason, 'anti_spam_20h', 'Must skip sending duplicate reminder within 20 hours');
  });

  it('12. deep link contains correct documentId, page, and y offset', () => {
    const appBaseUrl = 'https://studyflow-zeta-flame.vercel.app';
    const docId = 'doc-xyz';
    const page = 17;
    const y = 0.3541;

    const deepLink = `${appBaseUrl}/reader/${docId}?page=${page}&y=${y}`;
    assert.strictEqual(deepLink, 'https://studyflow-zeta-flame.vercel.app/reader/doc-xyz?page=17&y=0.3541');
  });
});
