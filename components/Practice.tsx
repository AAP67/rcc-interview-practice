'use client';
import { useState } from 'react';

export type PracticeQuestion = {
  id: string; text: string; category: string;
  scope: 'reported' | 'company_info' | 'role' | 'tailored';
  source_url: string | null; look_for: string[]; red_flags: string[]; tip: string;
};

type Feedback = {
  checks: Record<'on_topic' | 'specific' | 'example' | 'judgment', string>;
  score: number; max: number; worked: string; improve: string; hint: string; follow_up: string;
  error?: string;
};

type Attempt = { answer: string; fb: Feedback };

const CHECK_LABELS: Record<string, string> = {
  on_topic: 'On topic', specific: 'Specific details', example: 'Real example', judgment: 'Good judgment'
};
const CHECK_STYLE: Record<string, string> = {
  met: 'bg-green-50 text-green-800 border-green-200',
  partly: 'bg-amber-50 text-amber-800 border-amber-200',
  missing: 'bg-gray-50 text-gray-500 border-gray-200'
};
const CHECK_WORD: Record<string, string> = { met: '✓', partly: '½', missing: '✗' };

function scopeLabel(scope: string, company: string) {
  if (scope === 'reported') return 'Reported by candidates';
  if (scope === 'company_info') return `Based on ${company || 'the company'}'s hiring info`;
  if (scope === 'role') return 'Common for this role';
  return 'Written for this job';
}

export default function Practice({ questions, role, company, background, onExit }: {
  questions: PracticeQuestion[]; role: string; company: string; background: string; onExit: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, Attempt[]>>({});
  const [text, setText] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const q = questions[idx];
  const tries = attempts[q?.id] ?? [];
  const last = tries[tries.length - 1];
  const answering = tries.length === 0 || retrying;

  async function submit() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role, company, background, question: q, answer: text,
          attempt: tries.length + 1, previous_answer: tries[0]?.answer ?? ''
        })
      });
      const fb: Feedback = await res.json();
      if (fb.error) setError(fb.error);
      else {
        setAttempts({ ...attempts, [q.id]: [...tries, { answer: text, fb }] });
        setRetrying(false);
      }
    } catch {
      setError('The coach took too long. Please try again.');
    }
    setLoading(false);
  }

  function next() {
    setRetrying(false);
    setError('');
    setText('');
    if (idx + 1 < questions.length) setIdx(idx + 1);
    else setDone(true);
  }

  function restart() {
    setAttempts({});
    setIdx(0);
    setText('');
    setRetrying(false);
    setDone(false);
  }

  // ---------- summary ----------
  if (done) {
    const rows = questions.map(qq => {
      const t = attempts[qq.id] ?? [];
      const first = t[0]?.fb.score ?? null;
      const best = t.length ? Math.max(...t.map(a => a.fb.score)) : null;
      return { qq, first, best };
    });
    const answered = rows.filter(r => r.best !== null);
    const avg = answered.length ? answered.reduce((s, r) => s + (r.best ?? 0), 0) / answered.length : 0;

    // which check was missed most often (on each question's best attempt)
    const misses: Record<string, number> = { on_topic: 0, specific: 0, example: 0, judgment: 0 };
    for (const qq of questions) {
      const t = attempts[qq.id] ?? [];
      if (!t.length) continue;
      const bestTry = t.reduce((a, b) => (b.fb.score >= a.fb.score ? b : a));
      for (const k of Object.keys(misses)) if (bestTry.fb.checks[k as keyof Feedback['checks']] !== 'met') misses[k]++;
    }
    const weakest = Object.entries(misses).sort((a, b) => b[1] - a[1])[0];

    return (
      <main className="max-w-[860px] mx-auto px-6 py-10">
        <h1 className="text-[32px] font-medium tracking-tight">Practice summary</h1>
        <p className="text-gray-600 mt-1">{role}{company ? ` at ${company}` : ''}</p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 border border-gray-200 rounded-lg">
            <div className="text-sm text-gray-500">Average best score</div>
            <div className="text-3xl font-semibold mt-1">{avg.toFixed(1)} <span className="text-lg text-gray-400">/ 8</span></div>
          </div>
          {weakest && weakest[1] > 0 && (
            <div className="p-5 border border-gray-200 rounded-lg">
              <div className="text-sm text-gray-500">Practice next</div>
              <div className="text-xl font-semibold mt-1">{CHECK_LABELS[weakest[0]]}</div>
              <div className="text-sm text-gray-600 mt-1">Missed or partly met on {weakest[1]} of {answered.length} questions.</div>
            </div>
          )}
        </div>

        <ul className="mt-6 space-y-2.5">
          {rows.map(({ qq, first, best }, i) => (
            <li key={qq.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg">
              <div className="flex-1 text-[15px]"><span className="text-gray-400 mr-1">{i + 1}.</span>{qq.text}</div>
              <div className="text-right whitespace-nowrap text-[15px]">
                {best === null ? <span className="text-gray-400">Skipped</span> : (
                  <>
                    <span className="font-semibold">{best}/8</span>
                    {first !== null && best > first && <div className="text-xs text-green-700">up from {first}</div>}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex gap-3 mt-8">
          <button onClick={restart} className="h-11 px-6 font-semibold text-white bg-[#001489] rounded-md hover:bg-[#000E5C]">Practice these again</button>
          <button onClick={onExit} className="h-11 px-6 font-semibold text-[#001489] border border-gray-300 rounded-md hover:border-[#001489]">Try another job</button>
        </div>
      </main>
    );
  }

  // ---------- question ----------
  return (
    <main className="max-w-[860px] mx-auto px-6 py-10">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">Question {idx + 1} of {questions.length} · {role}{company ? ` at ${company}` : ''}</div>
        <button onClick={onExit} className="text-sm text-gray-500 hover:text-[#001489] underline">Exit</button>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mt-2">
        <div className="h-1.5 bg-[#001489] rounded-full" style={{ width: `${(idx / questions.length) * 100}%` }} />
      </div>

      <div className="mt-8 flex flex-wrap gap-1.5">
        <span className="px-2 py-0.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded">{q.category}</span>
        <span className="px-2 py-0.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded">{scopeLabel(q.scope, company)}</span>
      </div>
      <h1 className="text-[28px] font-medium leading-snug mt-3">{q.text}</h1>
      {q.tip && <p className="text-[15px] text-gray-600 mt-2">Tip: {q.tip}</p>}

      {answering ? (
        <div className="mt-6">
          {retrying && last && (
            <p className="text-sm text-gray-600 mb-2">Edit your answer using the feedback, then submit again.</p>
          )}
          <textarea rows={7} value={text} onChange={e => setText(e.target.value)} maxLength={3000}
            placeholder="Type your answer the way you'd say it in the interview."
            className="w-full px-4 py-3 text-base bg-white border-[1.5px] border-gray-300 rounded-md focus:outline-none focus:border-[#001489]" />
          <div className="flex items-center justify-between mt-2">
            <span className={`text-sm ${text.trim().length < 40 ? 'text-gray-400' : 'text-gray-500'}`}>
              {text.trim().length < 40 ? 'Write at least two or three sentences.' : `${text.trim().length} characters`}
            </span>
            <button onClick={submit} disabled={loading || text.trim().length < 40}
              className="h-11 px-6 font-semibold text-white bg-[#001489] rounded-md disabled:opacity-40 hover:bg-[#000E5C]">
              {loading ? 'Getting feedback…' : 'Get feedback'}
            </button>
          </div>
          {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
        </div>
      ) : last && (
        <div className="mt-6">
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-[15px] text-gray-700 whitespace-pre-wrap">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Your answer{tries.length > 1 ? ' (second try)' : ''}</div>
            {last.answer}
          </div>

          <div className="mt-5 p-5 border border-gray-200 rounded-lg">
            <div className="flex items-baseline justify-between">
              <div className="text-[15px] font-semibold">Feedback</div>
              <div className="text-2xl font-semibold">
                {tries.length > 1 && <span className="text-base text-gray-400 font-normal mr-2">{tries[0].fb.score} →</span>}
                {last.fb.score}<span className="text-base text-gray-400">/8</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(last.fb.checks).map(([k, v]) => (
                <span key={k} className={`px-2.5 py-1 text-sm font-semibold border rounded ${CHECK_STYLE[v]}`}>
                  {CHECK_WORD[v]} {CHECK_LABELS[k]}
                </span>
              ))}
            </div>
            <div className="mt-4 space-y-2 text-[15px]">
              <p><span className="font-semibold text-green-800">What worked: </span>{last.fb.worked}</p>
              <p><span className="font-semibold text-[#B14A00]">To improve: </span>{last.fb.improve}</p>
              {tries.length === 1 && <p><span className="font-semibold text-[#001489]">Think about: </span>{last.fb.hint}</p>}
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            {tries.length === 1 && (
              <button onClick={() => { setRetrying(true); setText(last.answer); }}
                className="h-11 px-6 font-semibold text-[#001489] border border-gray-300 rounded-md hover:border-[#001489]">
                Try again
              </button>
            )}
            <button onClick={next} className="h-11 px-6 font-semibold text-white bg-[#001489] rounded-md hover:bg-[#000E5C]">
              {idx + 1 < questions.length ? 'Next question' : 'See summary'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}