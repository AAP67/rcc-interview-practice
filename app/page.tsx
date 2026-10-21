'use client';
import { useState } from 'react';
import Practice, { type PracticeQuestion } from '@/components/Practice';

type Question = { text: string; category: string; scope: 'reported' | 'company_info' | 'role'; source_title: string | null; source_url: string | null };
type Research = {
  company: string; role: string; company_specific_found: boolean;
  process_notes: { note: string; source_url: string | null }[];
  questions: Question[];
  error?: string;
};

function domain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function Setup() {
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [posting, setPosting] = useState('');

  const [mode, setMode] = useState<'resume' | 'describe'>('describe');
  const [describe, setDescribe] = useState('');
  const [summary, setSummary] = useState('');
  const [uploading, setUploading] = useState(false);
  const [resumeError, setResumeError] = useState('');

  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState<Research | null>(null);

  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [practice, setPractice] = useState<PracticeQuestion[] | null>(null);

  const background = mode === 'describe' ? describe : summary;

  async function upload(file: File) {
    setUploading(true);
    setResumeError('');
    setSummary('');
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/resume', { method: 'POST', body: form });
      const json = await res.json();
      if (json.error) setResumeError(json.error);
      else setSummary(json.summary);
    } catch {
      setResumeError('Upload failed. Please try again.');
    }
    setUploading(false);
  }

  async function runResearch() {
    if (!role.trim()) return;
    setResearching(true);
    setResearch(null);
    setBuildError('');
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, company })
      });
      setResearch(await res.json());
    } catch {
      setResearch({ error: 'The research took too long. Please try again.' } as Research);
    }
    setResearching(false);
  }

  async function startPractice() {
    setBuilding(true);
    setBuildError('');
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, company, posting, background, research })
      });
      const json = await res.json();
      if (json.error) setBuildError(json.error);
      else {
        setPractice(json.questions);
        window.scrollTo({ top: 0 });
      }
    } catch {
      setBuildError('Building your questions took too long. Please try again.');
    }
    setBuilding(false);
  }

  const field = 'w-full px-4 py-3 text-base text-gray-900 bg-white border-[1.5px] border-gray-300 rounded-md focus:outline-none focus:border-[#001489]';
  const label = 'block text-sm font-semibold text-gray-900 mb-1.5';
  const badge = 'px-2 py-0.5 text-xs font-semibold rounded border';

  const header = (
    <header className="border-b-[3px] border-[#F15A22]">
      <div className="max-w-[860px] mx-auto px-6 h-[76px] flex items-center gap-4">
        <div className="text-lg font-bold text-[#001489]">Randolph Community College</div>
        <div className="w-px h-7 bg-gray-300" />
        <div className="text-lg font-semibold text-gray-700">Interview Practice</div>
      </div>
    </header>
  );

  if (practice) {
    return (
      <div className="min-h-screen bg-white text-gray-900">
        {header}
        <Practice questions={practice} role={role} company={company} background={background}
          onExit={() => { setPractice(null); window.scrollTo({ top: 0 }); }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {header}

      <main className="max-w-[860px] mx-auto px-6 py-10">
        <h1 className="text-[36px] font-medium tracking-tight leading-tight">Practice for a real job interview</h1>
        <p className="mt-2 text-[17px] text-gray-600 max-w-[620px]">
          Tell us the job and a little about yourself. We&apos;ll look up what people report being asked,
          then you practice. You answer; the AI coaches.
        </p>

        {/* 1. The job */}
        <section className="mt-9">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">1. The job</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <label className={label} htmlFor="role">Job title *</label>
              <input id="role" className={field} placeholder="e.g. Maintenance Technician"
                value={role} onChange={e => setRole(e.target.value)} maxLength={100} />
            </div>
            <div>
              <label className={label} htmlFor="company">Company</label>
              <input id="company" className={field} placeholder="e.g. Energizer"
                value={company} onChange={e => setCompany(e.target.value)} maxLength={100} />
            </div>
          </div>
          <div className="mt-4">
            <label className={label} htmlFor="posting">Job posting <span className="font-normal text-gray-500">(optional, paste it in)</span></label>
            <textarea id="posting" rows={5} className={field} placeholder="Paste the job description here for more tailored questions."
              value={posting} onChange={e => setPosting(e.target.value)} maxLength={8000} />
          </div>
        </section>

        {/* 2. Background */}
        <section className="mt-9">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">2. Your background</h2>
          <div className="inline-flex mt-3 p-1 bg-gray-100 rounded-lg">
            {(['describe', 'resume'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-4 py-2 text-sm font-semibold rounded-md ${mode === m ? 'bg-white text-[#001489] shadow-sm' : 'text-gray-600'}`}>
                {m === 'describe' ? 'Describe my experience' : 'Upload a resume'}
              </button>
            ))}
          </div>

          {mode === 'describe' ? (
            <div className="mt-4">
              <textarea rows={4} className={field}
                placeholder="e.g. Second year in Welding Technology. I have my MIG certificate. I worked part-time at a hardware store. No factory experience yet."
                value={describe} onChange={e => setDescribe(e.target.value)} maxLength={3000} />
              <p className="text-sm text-gray-500 mt-1.5">Class, shop, part-time jobs, sports, and family work all count.</p>
            </div>
          ) : (
            <div className="mt-4">
              <input type="file" accept=".pdf,.docx,.txt"
                onChange={e => e.target.files?.[0] && upload(e.target.files[0])}
                className="block text-sm text-gray-700 file:mr-3 file:px-4 file:py-2 file:rounded-md file:border-0 file:bg-[#001489] file:text-white file:font-semibold" />
              <p className="text-sm text-gray-500 mt-1.5">PDF, Word (.docx), or text. Under 5 MB.</p>
              {uploading && <p className="text-sm text-gray-600 mt-3">Reading your resume…</p>}
              {resumeError && <p className="text-sm text-red-700 mt-3">{resumeError}</p>}
              {summary && (
                <div className="mt-4">
                  <label className={label} htmlFor="summary">What we picked up. Fix anything that&apos;s wrong.</label>
                  <textarea id="summary" rows={5} className={field} value={summary} onChange={e => setSummary(e.target.value)} />
                </div>
              )}
            </div>
          )}
        </section>

        {/* 3. Research */}
        <section className="mt-9">
          <button onClick={runResearch} disabled={!role.trim() || researching}
            className="h-12 px-7 text-base font-semibold text-white bg-[#001489] rounded-md disabled:opacity-40 hover:bg-[#000E5C]">
            {researching ? 'Researching this job…' : 'Research this job'}
          </button>
          {researching && <p className="text-sm text-gray-500 mt-2">Searching the web for reported interview questions. This can take up to a minute.</p>}
        </section>

        {research?.error && (
          <div className="mt-6 p-5 border border-red-200 bg-red-50 rounded-lg font-semibold">{research.error}</div>
        )}

        {research && !research.error && (
          <section className="mt-8">
            {research.process_notes.length > 0 && (
              <div className="p-5 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-[15px] font-semibold">How {research.company || 'this employer'} hires</div>
                <ul className="mt-2 space-y-1.5">
                  {research.process_notes.map((n, i) => (
                    <li key={i} className="text-[15px] text-gray-700">
                      {n.note}{' '}
                      {n.source_url && (
                        <a href={n.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-[#001489] underline">
                          {domain(n.source_url)}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 text-[15px] font-semibold">
              Questions found for this {research.company_specific_found ? 'company and role' : 'role'}
            </div>
            {!research.company_specific_found && research.company && (
              <p className="text-sm text-gray-500 mt-0.5">We didn&apos;t find anything specific to {research.company}, so these are for the role in general.</p>
            )}
            <ul className="mt-3 space-y-2.5">
              {research.questions.map((q, i) => (
                <li key={i} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    <span className={`${badge} text-gray-700 bg-gray-100 border-gray-100`}>{q.category}</span>
                    {q.scope === 'reported' && (
                      <span className={`${badge} text-[#B14A00] bg-orange-50 border-orange-200`}>Reported by candidates</span>
                    )}
                    {q.scope === 'company_info' && (
                      <span className={`${badge} text-[#001489] bg-blue-50 border-blue-200`}>
                        Based on {research.company || 'the company'}&apos;s hiring info
                      </span>
                    )}
                    {q.scope === 'role' && (
                      <span className={`${badge} text-gray-600 bg-white border-gray-200`}>Common for this role</span>
                    )}
                  </div>
                  <div className="text-[15px]">{q.text}</div>
                  {q.source_url && (
                    <a href={q.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-[#001489] underline mt-1 inline-block">
                      Source: {domain(q.source_url)}
                    </a>
                  )}
                </li>
              ))}
            </ul>

            {/* 4. Start */}
            <div className="mt-8 p-6 bg-[#001489] rounded-xl text-white">
              <div className="text-lg font-semibold">Ready to practice?</div>
              <p className="text-[15px] text-blue-100 mt-1">
                We&apos;ll pick 5 questions for you from this research, your background, and the posting.
                You answer each one, get feedback, and can try once more.
              </p>
              <button onClick={startPractice} disabled={building}
                className="mt-4 h-11 px-6 font-semibold text-[#001489] bg-white rounded-md disabled:opacity-60 hover:bg-blue-50">
                {building ? 'Building your questions…' : 'Start practice'}
              </button>
              {buildError && <p className="text-sm text-red-200 mt-3">{buildError}</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}