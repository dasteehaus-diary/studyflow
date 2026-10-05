'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CassetteProgress } from '@/components/CassetteProgress';

export function PdfReaderDemo() {
  const [notes, setNotes] = useState(true);
  return (
    <div className="readerShell">
      <header className="readerTop">
        <Link href="/">← Library</Link>
        <strong>Dopamine & Motivation</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary">Search</button>
          <button className="secondary" onClick={() => setNotes(v => !v)}>{notes ? 'Hide notes' : 'Notes'}</button>
          <button className="secondary">Focus</button>
        </div>
      </header>
      <div className={`readerBody ${notes ? 'notesOpen' : ''}`}>
        <main className="pdfStage">
          <article className="pdfPaper">
            <div className="eyebrow">PDF technical-spike placeholder · page 47</div>
            <h1 style={{ fontSize: 36 }}>Reward prediction & anticipation</h1>
            <p>This screen is intentionally a lightweight placeholder. The technical spike replaces this paper with React-PDF 11 and virtualized pages after local OPFS import is verified.</p>
            <p>StudyFlow should remember not only where the reader stopped, but the thought they were carrying when they stopped.</p>
            <p><mark style={{ background: 'rgba(246,165,110,.42)' }}>A highlight can be linked to a note without making every highlight require a note.</mark></p>
          </article>
        </main>
        {notes && <aside className="notesPanel">
          <div className="eyebrow">Notes</div>
          <h2 style={{ marginTop: 7 }}>Page 47</h2>
          <button className="secondary">＋ Quick note</button>
          <div className="noteItem"><div className="noteQuote">“Reward prediction & anticipation...”</div><p>Áp dụng ý này vào cơ chế B-Side Mystery.</p></div>
          <div className="noteItem"><div className="noteQuote" style={{ borderColor: 'var(--rose)' }}>❓ Open question</div><p>Prediction error khác novelty ở điểm nào?</p></div>
          <div className="noteItem"><div className="noteQuote" style={{ borderColor: 'var(--olive-cream)' }}>📌 Parking note</div><p>Mai đọc tiếp từ phần thí nghiệm ở trang 53.</p></div>
        </aside>}
      </div>
      <footer className="readerBottom"><CassetteProgress value={42} /></footer>
    </div>
  );
}
