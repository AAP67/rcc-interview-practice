/* eslint-disable @typescript-eslint/no-explicit-any */

// reported     = the source itself lists this question as asked (candidate reports, company lists)
// company_info = written by the AI from the employer's own hiring/job info
// role         = common question for this kind of job
type Scope = 'reported' | 'company_info' | 'role';

type Question = {
  text: string;
  category: string;
  scope: Scope;
  source_title: string | null;
  source_url: string | null;
};

type Research = {
  company: string;
  role: string;
  company_specific_found: boolean;
  process_notes: { note: string; source_url: string | null }[];
  questions: Question[];
  sources: { title: string; url: string }[];
};

// simple in-memory cache: same company + role within 24h returns instantly
const cache = new Map<string, { at: number; data: Research }>();
const DAY = 24 * 60 * 60 * 1000;

const SYSTEM = `You research job interviews for Randolph Community College students in Asheboro, North Carolina.
Most are entry-level candidates for skilled-trades, manufacturing, healthcare, and technical jobs.

Use web search to find interview questions for the given role, at the given company if possible.
Search in this order, and stop once you have enough:
1. The company's own careers or hiring-process pages
2. Indeed and Glassdoor company interview pages
3. Staffing agencies' interview guides for this role (Aerotek, Adecco, PeopleReady, etc.)
4. Trade schools and manufacturing hiring sites with question lists for this role
5. Reddit trade communities, only as supporting evidence

Label every question with exactly one scope. Be strict:
- "reported": the source page itself lists this question, or one very close to it, as asked in interviews
  at this company (candidate reports on Glassdoor or Indeed, or a list the company publishes).
  If you did not see the question on that page, it is NOT "reported".
- "company_info": you wrote the question yourself, based on what the company's own pages say about
  its hiring process, values, or job duties. source_url is that company page.
- "role": a common question for this kind of job, from general prep guides or your own knowledge.
  Give a source_url only if a guide actually lists it; otherwise null.

Other rules:
- Write every question in your own words. Do not copy text from the sources.
- Keep each question short, the way an interviewer would say it out loud. No long preambles.
- source_url must be a URL you actually got from a search result. If unsure, use null.
- process_notes: short facts about the company's hiring steps (assessments, hands-on tests, interview format), only if a source says so.
- Up to 10 questions. Mix technical, safety, behavioral, and teamwork.

Your final message must be ONLY this JSON, no markdown fences:
{
  "process_notes": [{ "note": "...", "source_url": "..." }],
  "questions": [{ "text": "...", "category": "Technical|Safety|Behavioral|Teamwork|Reliability|Company", "scope": "reported|company_info|role", "source_title": "...", "source_url": "..." }]
}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const company = String(body.company ?? '').trim().replace(/[.\s]+$/, '').slice(0, 100);
    const role = String(body.role ?? '').trim().slice(0, 100);
    if (!role) {
      return Response.json({ error: 'Tell us the job title first.' }, { status: 400 });
    }

    const key = `${company}|${role}`.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < DAY) {
      return Response.json({ ...hit.data, cached: true });
    }

    let data: any;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(90000),
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          system: SYSTEM,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
          messages: [{
            role: 'user',
            content: `Role: ${role}\nCompany: ${company || '(not given; research the role only)'}\nLocation: Asheboro, North Carolina area`
          }]
        })
      });
      data = await res.json();
      if (!res.ok || data.error) {
        console.error('Anthropic error:', data.error);
        return Response.json({ error: 'The research service is unavailable right now. Please try again.' }, { status: 502 });
      }
    } catch {
      return Response.json({ error: 'The research took too long. Please try again.' }, { status: 504 });
    }

    // every URL the search actually returned
    const found = new Map<string, string>();
    for (const block of data.content ?? []) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.url) found.set(r.url, r.title ?? r.url);
        }
      }
    }

    // the final JSON is in the text blocks
    const text = (data.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    let parsed: any;
    try {
      parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    } catch {
      console.error('Could not parse research output:', text.slice(0, 500));
      return Response.json({ error: 'Could not read the research results. Please try again.' }, { status: 502 });
    }

    // drop any source link the search didn't actually return
    const verify = (url: any) => (typeof url === 'string' && found.has(url) ? url : null);

    const questions: Question[] = (parsed.questions ?? []).slice(0, 10).map((q: any) => {
      const url = verify(q.source_url);
      let scope: Scope = ['reported', 'company_info', 'role'].includes(q.scope) ? q.scope : 'role';
      // "reported" and "company_info" both need a real source; otherwise treat as a general role question
      if (scope !== 'role' && !url) scope = 'role';
      return {
        text: String(q.text ?? ''),
        category: String(q.category ?? 'Behavioral'),
        scope,
        source_title: url ? (found.get(url) ?? q.source_title ?? null) : null,
        source_url: url
      };
    }).filter((q: Question) => q.text);

    const result: Research = {
      company,
      role,
      company_specific_found: questions.some(q => q.scope !== 'role'),
      process_notes: (parsed.process_notes ?? [])
        .map((n: any) => ({ note: String(n.note ?? ''), source_url: verify(n.source_url) }))
        .filter((n: any) => n.note && n.source_url),
      questions,
      sources: [...found].map(([url, title]) => ({ title, url }))
    };

    cache.set(key, { at: Date.now(), data: result });
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}