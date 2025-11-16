import { NextRequest } from 'next/server';

const PEXELS_ENDPOINT = 'https://api.pexels.com/v1/search';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || 'abstract background';
  const key = process.env.PEXELS_API_KEY;

  try {
    if (!key) {
      // return a simple gradient PNG as fallback
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='720' height='1280'>
        <defs>
          <linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stop-color='#1d2a3a'/>
            <stop offset='100%' stop-color='#0b0f14'/>
          </linearGradient>
        </defs>
        <rect width='100%' height='100%' fill='url(#g)'/>
        <text x='50%' y='90%' text-anchor='middle' fill='#94a3b8' font-size='32' font-family='system-ui'>${escapeXml(q)}</text>
      </svg>`;
      const png = Buffer.from(svg);
      return new Response(png, { headers: { 'Content-Type': 'image/svg+xml' } });
    }

    const resp = await fetch(`${PEXELS_ENDPOINT}?query=${encodeURIComponent(q)}&per_page=1`, {
      headers: { Authorization: key }
    });
    const data = await resp.json();
    const photo = data?.photos?.[0];
    const url: string = photo?.src?.large2x || photo?.src?.large || photo?.src?.medium;
    if (!url) throw new Error('no image');
    const img = await fetch(url);
    const buf = Buffer.from(await img.arrayBuffer());
    return new Response(buf, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
  } catch (e) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='720' height='1280'>
      <rect width='100%' height='100%' fill='#0b0f14'/>
      <text x='50%' y='50%' text-anchor='middle' fill='#64748b' font-size='28' font-family='system-ui'>No image</text>
    </svg>`;
    return new Response(Buffer.from(svg), { headers: { 'Content-Type': 'image/svg+xml' } });
  }
}

function escapeXml(s: string) {
  return s.replace(/[&<>"]+/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as any)[c]);
}
