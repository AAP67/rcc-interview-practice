/* eslint-disable @typescript-eslint/no-explicit-any */

type ResearchQ = { text: string; category: string; scope: string; source_url: string | null };

const SYSTEM = `You prepare a 5-question practice interview for a Randolph Community College student.
Many students are 16-25 with little work history. Class, shop, lab, sports, and family-work examples all count.

Pick and tailor exactly 5 questions:
1. One opener: why this job or this company.
2. One or two technical or job-skill questions tied to the job duties.
3. One safety or quality question.
4. One or two behavioral or teamwork questions.

Rules:
- Prefer questions from the research list, especially "reported" and "company_info" ones.
  When you use or adapt one, set based_on to its index number. You may lightly reword it for this student.
- When you write a new question for this posting or this student's background, set based_on to null.
- Fit the student. If they have no factory experience, ask in a way they can answer from class, shop, or other work,
  e.g. "Tell me about a time in class or at work..." Do not ask about experience they clearly don't have.
- Keep each question short, the way an interviewer says it out loud.
- For each question, write a private scoring guide for the coach:
  look_for: 2-4 things a strong answer includes; red_flags: 1-3 things that hurt an answer.
- tip: one short line telling the student what kind of example would work, without telling them what to say.

Return ONLY JSON, no markdown fences:
{ "questions": [ { "text": "...", "category": "Opener|Technical|Safety|Quality|Behavioral|Teamwork|Reliability",
  "based_on": <index or null>, "look_for": ["..."], "red_flags": ["..."], "tip": "..." } ] }`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const role = String(body.role ?? '').trim().slice(0, 100);
    const company = String(body.company ?? '').trim().slice(0, 100);
    const posting = String(body.posting ?? '').trim().slice(0, 6000);
    const background = String(body.background ?? '').trim().slice(0, 3000);
    const research: ResearchQ[] = Array.isArray(body.research?.questions) ? body.research.questions.slice(0, 10) : [];
    const notes: string[] = Array.isArray(body.research?.process_notes)
      ? body.research.process_notes.map((n: any) => String(n.note ?? '')).slice(0, 8)
      : [];

    if (!role) {
      return Response.json({ error: 'Tell us the job title first.' }, { status: 400 });
    }

    const list = research.map((q, i) => `${i}. [${q.scope}] (${q.category}) ${q.text}`).join('\n') || '(none)';

    let data: any;
    try {
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
          max_tokens: 2500,
          system: SYSTEM,
          messages: [{
            role: 'user',
            content: `Job: ${role}${company ? ` at ${company}` : ''}

How this employer hires:
${notes.join('\n') || '(unknown)'}

Job posting:
${posting || '(not provided)'}

Student background:
${background || '(not provided; assume a current RCC student with little work history)'}

Research questions:
${list}`
          }]
        })
      });
      data = await res.json();
      if (!res.ok || data.error) {
        console.error('Anthropic error:', data.error);
        return Response.json({ error: 'The AI service is unavailable right now. Please try again.' }, { status: 502 });
      }
    } catch {
      return Response.json({ error: 'Building your questions took too long. Please try again.' }, { status: 504 });
    }

    let parsed: any;
    try {
      const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    } catch {
      return Response.json({ error: 'Could not build your questions. Please try again.' }, { status: 502 });
    }

    // copy the label and source from the research question it came from, so provenance can't be invented
    const questions = (parsed.questions ?? []).slice(0, 5).map((q: any, i: number) => {
      const src = Number.isInteger(q.based_on) ? research[q.based_on] : undefined;
      return {
        id: `q${i + 1}`,
        text: String(q.text ?? ''),
        category: String(q.category ?? 'Behavioral'),
        scope: src ? src.scope : 'tailored',
        source_url: src ? src.source_url : null,
        look_for: Array.isArray(q.look_for) ? q.look_for.map(String).slice(0, 4) : [],
        red_flags: Array.isArray(q.red_flags) ? q.red_flags.map(String).slice(0, 3) : [],
        tip: String(q.tip ?? '')
      };
    }).filter((q: any) => q.text);

    if (questions.length < 3) {
      return Response.json({ error: 'Could not build enough questions. Please try again.' }, { status: 502 });
    }
    return Response.json({ questions });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}