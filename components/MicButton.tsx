'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';

export default function MicButton({ onText }: { onText: (t: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) t += e.results[i][0].transcript;
      }
      if (t.trim()) onTextRef.current(t.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setSupported(true);
    return () => rec.abort();
  }, []);

  if (!supported) return null;

  function toggle() {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
    } else {
      try { rec.start(); setListening(true); } catch { /* already started */ }
    }
  }

  return (
    <button type="button" onClick={toggle}
      className={`inline-flex items-center gap-2 h-9 px-4 text-sm font-semibold rounded-full border ${
        listening ? 'text-white bg-red-600 border-red-600 animate-pulse' : 'text-[#001489] bg-white border-gray-300 hover:border-[#001489]'
      }`}>
      <span aria-hidden>{listening ? '■' : '🎤'}</span>
      {listening ? 'Stop' : 'Speak'}
    </button>
  );
}