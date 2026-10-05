import Link from 'next/link';
import { TechnicalSpikesHarness } from '@/components/spike/TechnicalSpikesHarness';

export default function LocalPdfSpikePage() {
  return (
    <main className="spikePage">
      <div className="spikeTopbar"><Link href="/">← StudyFlow</Link><span>Technical Spikes (A–E)</span></div>
      <TechnicalSpikesHarness />
    </main>
  );
}
