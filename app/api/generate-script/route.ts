import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { niche, count } = await req.json();
    const n = Math.max(1, Math.min(10, Number(count) || 1));

    if (!process.env.OPENAI_API_KEY) {
      // Fallback mock
      const items = Array.from({ length: n }).map((_, i) => mockItem(niche || 'general', i));
      return NextResponse.json({ items });
    }

    const prompt = `Generate ${n} YouTube Shorts scripts for a faceless channel in the niche: "${niche}".
Each script should be 15-60 seconds. Return strict JSON array with objects:
{
  hook: string,
  lines: { text: string, start: number, end: number }[],
  cta: string,
  visuals: string[],
  durationSec: number
}
Ensure "lines" timings are sequential within duration.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a concise content strategist for YouTube Shorts.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' as any },
    });

    // Expect the model to wrap array in an object { items: [...] }
    let data: any;
    try {
      data = JSON.parse(completion.choices[0].message.content || '{}');
    } catch {
      data = { items: [] };
    }

    if (!Array.isArray(data.items)) {
      data.items = Array.isArray(data) ? data : [];
    }

    // Basic guard + clamp
    const items = (data.items || []).slice(0, n).map((it: any, idx: number) => normalizeItem(it, niche, idx));

    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

function normalizeItem(it: any, niche: string, idx: number) {
  const durationSec = clamp(Number(it?.durationSec) || 30, 15, 60);
  const lines = Array.isArray(it?.lines) && it.lines.length > 0 ? it.lines : [
    { text: `Quick tip in ${niche}: stay consistent!`, start: 0, end: Math.min(3, durationSec) },
  ];
  return {
    hook: String(it?.hook || `Hot ${niche} tip you need now!`),
    lines,
    cta: String(it?.cta || 'Follow for daily insights!'),
    visuals: Array.isArray(it?.visuals) && it.visuals.length ? it.visuals.slice(0, 5) : [niche, 'dynamic background', 'bold typography'],
    durationSec,
    keywords: { title: '', tags: [], description: '' },
  };
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

function mockItem(niche: string, i: number) {
  const durationSec = 24 + (i % 12);
  const lines = [
    { text: `3 ${niche} facts in 20 seconds`, start: 0, end: 3 },
    { text: `Fact 1: Actionable and surprising`, start: 3, end: 8 },
    { text: `Fact 2: Counter-intuitive insight`, start: 8, end: 14 },
    { text: `Fact 3: Quick win you can try`, start: 14, end: 20 },
  ];
  return {
    hook: `Stop scrolling: ${niche} you haven?t heard`,
    lines,
    cta: 'Like & subscribe for daily nuggets',
    visuals: [niche, 'minimal pattern', 'bold text'],
    durationSec,
    keywords: { title: '', tags: [], description: '' },
  } as const;
}
