import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json();
    if (!Array.isArray(items)) return NextResponse.json({ items: [] });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ items: items.map((it: any, i: number) => ({
        ...it,
        keywords: {
          title: `${it.hook} #shorts`.
            replace(/[.]/g, '').slice(0, 70),
          tags: ["shorts", "viral", "tips"],
          description: `${it.hook} ? ${it.cta}`.slice(0, 4000)
        }
      })) });
    }

    const prompt = `For each script, suggest an SEO-optimized YouTube Short title (<=70 chars), 10 tags, and a 1-2 sentence description. Return JSON array with objects { title, tags, description } in same order.`;

    const scriptsText = items.map((it: any, i: number) => (
      `#${i+1}\nHOOK: ${it.hook}\nCTA: ${it.cta}\nLINES: ${it.lines.map((l:any)=>l.text).join(' | ')}`
    )).join('\n\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an SEO optimizer for YouTube Shorts.' },
        { role: 'user', content: `${prompt}\n\n${scriptsText}` }
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' as any },
    });

    let data: any = {};
    try { data = JSON.parse(completion.choices[0].message.content || '{}'); } catch {}
    const arr = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

    const enriched = items.map((it: any, i: number) => ({
      ...it,
      keywords: arr[i] ? {
        title: String(arr[i].title || it.hook).slice(0, 70),
        tags: Array.isArray(arr[i].tags) ? arr[i].tags.slice(0, 15) : ["shorts"],
        description: String(arr[i].description || `${it.hook} ? ${it.cta}`).slice(0, 4000)
      } : {
        title: it.hook,
        tags: ["shorts"],
        description: `${it.hook} ? ${it.cta}`
      }
    }));

    return NextResponse.json({ items: enriched });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
