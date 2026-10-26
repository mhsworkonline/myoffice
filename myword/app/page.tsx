'use client';
import dynamic from 'next/dynamic';

const App = dynamic(() => import('../src/ui/App').then((m) => m.App), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#185ABD', fontSize: 14 }}>Loading MyWord…</div>
  ),
});

export default function Page() {
  return <App />;
}
