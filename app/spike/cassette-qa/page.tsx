'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CassetteProgress } from '@/components/CassetteProgress';
import { useSettings } from '@/lib/settings/settings-context';

export default function CassetteVisualQAPage() {
  const { settings, updateSettings } = useSettings();
  const [scrubberValue, setScrubberValue] = useState(42);

  const testStates = [0, 25, 50, 75, 100];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Link href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
            ← Quay lại Thư viện
          </Link>
          <h1 style={{ margin: '8px 0 4px', fontSize: 24 }}>Cassette Visual QA & Snapshots (v0.2.3)</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Kiểm tra tỷ lệ tape, spools, window, và các mốc phần trăm 0% · 25% · 50% · 75% · 100%
          </p>
        </div>

        {/* Quick theme toggles for visual check */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--card-subtle)', padding: 4, borderRadius: 8 }}>
          {(['warm', 'light', 'dark'] as const).map(t => (
            <button
              key={t}
              className="secondary"
              style={{
                fontSize: 12,
                padding: '4px 10px',
                fontWeight: settings.appTheme === t ? 700 : 400,
                borderColor: settings.appTheme === t ? 'var(--olive)' : undefined
              }}
              onClick={() => updateSettings({ appTheme: t })}
            >
              {t === 'warm' ? 'Ấm' : t === 'light' ? 'Sáng' : 'Tối'}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive scrubber */}
      <section className="card" style={{ padding: '16px 20px', marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Kéo thử tiến độ tùy biến (Scrubber: {scrubberValue}%)</h3>
        <input
          type="range"
          min="0"
          max="100"
          value={scrubberValue}
          onChange={e => setScrubberValue(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--terracotta)', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', gap: 24, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6 }}>Variant: reader</div>
            <CassetteProgress value={scrubberValue} variant="reader" />
          </div>
          <div>
            <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6 }}>Variant: mini</div>
            <CassetteProgress value={scrubberValue} variant="mini" />
          </div>
          <div>
            <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6 }}>Variant: reward</div>
            <CassetteProgress value={scrubberValue} variant="reward" />
          </div>
        </div>
      </section>

      {/* Snapshots table for 0%, 25%, 50%, 75%, 100% */}
      <section className="card" style={{ padding: '20px 24px', marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Bộ 5 mốc tiến độ chuẩn (Test Snapshots)</h3>
        <div style={{ display: 'grid', gap: 20 }}>
          {testStates.map(statePct => (
            <div
              key={statePct}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 8,
                background: 'var(--card-subtle)',
                border: '1px solid var(--line)',
                flexWrap: 'wrap',
                gap: 16
              }}
            >
              <div style={{ minWidth: 80 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Mốc {statePct}%</span>
                <div className="muted" style={{ fontSize: 11 }}>
                  {statePct === 0 ? 'Chưa bắt đầu' : statePct === 100 ? 'Hoàn thành' : 'Đang đọc'}
                </div>
              </div>

              {/* Reader Variant */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CassetteProgress value={statePct} variant="reader" />
              </div>

              {/* Mini Variant */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CassetteProgress value={statePct} variant="mini" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 390px Mobile Viewport Simulation */}
      <section className="card" style={{ padding: '20px 24px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Mô phỏng Mobile Viewport (390px — iPhone Frame)</h3>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 16px' }}>
          Đảm bảo không tràn màn hình, không wrap vỡ bố cục trên màn hình nhỏ.
        </p>
        <div
          style={{
            width: 390,
            maxWidth: '100%',
            padding: '14px 16px',
            border: '2px dashed var(--line)',
            borderRadius: 12,
            background: 'var(--panel)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}
        >
          <button className="secondary" style={{ fontSize: 12, padding: '4px 8px' }}>
            📌 Park
          </button>
          <CassetteProgress value={scrubberValue} variant="reader" />
          <span className="muted" style={{ fontSize: 12 }}>
            Trang 2/55
          </span>
        </div>
      </section>
    </div>
  );
}
