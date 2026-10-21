/* eslint-disable @typescript-eslint/no-explicit-any */
import mammoth from 'mammoth';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const SYSTEM = `You read a student's resume to prepare interview practice.
Extract only work-relevant background: jobs (title, kind of employer, how long if stated),
RCC program or other training, certifications, hands-on skills and tools, and school, shop, or volunteer projects.
Leave out name, address, phone, email, dates of birth, and references.

Return ONLY JSON, no markdown fences:
{
  "summary": "<3-8 short lines, one fact per line, separated by \\n>",
  "has_work_history": true or false
}`;

async function callClaude(content: any[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(45000),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content }]
    })
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    console.error('Anthropic error:', data.error);
    throw new Error('ai');
  }
  const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return Response.json({ error: 'Choose a resume file to upload.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: 'That file is too large. Use a file under 5 MB.' }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    let content: any[];

    if (name.endsWith('.pdf')) {
      // Claude reads PDFs directly
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
        { type: 'text', text: 'Here is the resume.' }
      ];
    } else if (name.endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      content = [{ type: 'text', text: `Resume:\n${value.slice(0, 20000)}` }];
    } else if (name.endsWith('.txt')) {
      content = [{ type: 'text', text: `Resume:\n${buf.toString('utf8').slice(0, 20000)}` }];
    } else {
      return Response.json({ error: 'Upload a PDF, Word (.docx), or text file.' }, { status: 400 });
    }

    let parsed: any;
    try {
      parsed = await callClaude(content);
    } catch {
      return Response.json({ error: 'Could not read that resume. Try again, or describe your experience instead.' }, { status: 502 });
    }

    return Response.json({
      summary: String(parsed.summary ?? '').trim(),
      has_work_history: Boolean(parsed.has_work_history)
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}