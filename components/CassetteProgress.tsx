export function CassetteProgress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="cassette" aria-label={`Tiến độ ${pct}%`}>
      <span className="reel" aria-hidden />
      <div className="track"><span style={{ width: `${pct}%` }} /></div>
      <span className="reel" aria-hidden />
      <span className="progressText">{pct}%</span>
    </div>
  );
}
