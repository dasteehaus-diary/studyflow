'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PdfReader } from '@/components/reader/PdfReader';

function ReaderContent() {
  const params = useParams();
  const searchParams = useSearchParams();

  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const pageParam = searchParams.get('page');
  const yParam = searchParams.get('y');
  const highlightParam = searchParams.get('highlight');

  const initialPage = pageParam ? parseInt(pageParam, 10) : undefined;
  const initialY = yParam ? parseFloat(yParam) : undefined;
  const initialHighlightId = highlightParam || undefined;

  if (!id) return null;

  return (
    <PdfReader
      documentId={id}
      initialPage={initialPage}
      initialY={initialY}
      initialHighlightId={initialHighlightId}
    />
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Đang chuẩn bị reader…</div>}>
      <ReaderContent />
    </Suspense>
  );
}
