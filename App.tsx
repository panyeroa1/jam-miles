
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GeminiLiveManager } from './services/geminiService';
import { TranscriptionEntry, ConnectionStatus } from './types';
import { 
  Mic, Info, Square, MessageSquare, X, Camera, CameraOff, ScreenShare, MonitorOff, Play, Loader2, Sparkles, AlertCircle, RefreshCw, Heart
} from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.IDLE);
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [currentAssistantText, setCurrentAssistantText] = useState('');
  const [currentUserText, setCurrentUserText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<Uint8Array>(new Uint8Array(0));
  const [showHistory, setShowHistory] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [hasMic, setHasMic] = useState(true);
  const [hasCam, setHasCam] = useState(true);

  const managerRef = useRef<GeminiLiveManager | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const checkHardware = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        setHasMic(false);
        setHasCam(false);
        setError("Your browser doesn't support device detection, Jamjam!");
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const cams = devices.filter(d => d.kind === 'videoinput');
      
      const foundMic = mics.length > 0;
      const foundCam = cams.length > 0;
      
      setHasMic(foundMic);
      setHasCam(foundCam);
      
      if (!foundMic) {
        setError("I can't find a microphone, Jamjam! Please plug one in so we can chat.");
      } else {
        // Clear only if it's a mic related error
        setError(prev => (prev && prev.includes("microphone")) ? null : prev);
      }
    } catch (e) {
      console.warn("Hardware check failed", e);
    }
  }, []);

  // Check hardware on mount
  useEffect(() => {
    checkHardware();
  }, [checkHardware]);

  const playConnectSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (status === ConnectionStatus.CONNECTED) {
      playConnectSound();
      timerIntervalRef.current = window.setInterval(() => setSecondsElapsed(prev => prev + 1), 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (status === ConnectionStatus.IDLE) setSecondsElapsed(0);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [status, playConnectSound]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const canvas = visualizerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame: number;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const isMob = rect.width < 640;
      const baseR = isMob ? 70 : 100;
      ctx.clearRect(0, 0, rect.width, rect.height);
      const breathe = Math.sin(Date.now() / 1200) * 5;
      let avg = 0;
      if (audioData.length > 0) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) sum += audioData[i];
        avg = sum / audioData.length;
      }
      const pulse = (avg / 255) * (isMob ? 50 : 80);
      for (let i = 1; i <= (isMob ? 4 : 6); i++) {
        const rr = baseR + (i * (isMob ? 22 : 32)) + (breathe * 0.8) + (pulse * 0.3);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.lineWidth = 0.8 + (i * 0.15);
        ctx.strokeStyle = error ? `rgba(255, 77, 77, ${0.05 - (i * 0.005)})` : `rgba(92, 99, 58, ${0.06 - (i * 0.008)})`;
        ctx.stroke();
      }
      if (audioData.length > 0 && status === ConnectionStatus.CONNECTED) {
        const step = (Math.PI * 2) / audioData.length;
        for (let i = 0; i < audioData.length; i++) {
          const val = audioData[i];
          const bh = (val / 255) * (isMob ? 35 : 55);
          const a = i * step;
          const ix = cx + Math.cos(a) * (baseR + pulse + 8);
          const iy = cy + Math.sin(a) * (baseR + pulse + 8);
          const ox = cx + Math.cos(a) * (baseR + pulse + 8 + bh);
          const oy = cy + Math.sin(a) * (baseR + pulse + 8 + bh);
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(ox, oy);
          ctx.lineWidth = isMob ? 3 : 4;
          ctx.lineCap = 'round';
          ctx.strokeStyle = `rgba(197, 210, 153, ${0.4 + (val / 255) * 0.6})`;
          ctx.stroke();
        }
      }
      const cr = baseR + (pulse * 0.6);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
      grad.addColorStop(0, error ? '#ffc4c4' : '#d8e1bc');
      grad.addColorStop(0.7, error ? '#ff4d4d' : '#c5d299');
      grad.addColorStop(1, error ? '#d43f3f' : '#b4c386');
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      if (isCameraOn || isScreenSharing) {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.clip();
        const v = videoRef.current;
        if (v && v.readyState >= v.HAVE_ENOUGH_DATA) {
          const r = v.videoWidth / v.videoHeight;
          let dw, dh;
          if (r > 1) { dh = cr * 2; dw = dh * r; } else { dw = cr * 2; dh = dw / r; }
          ctx.drawImage(v, cx - dw / 2, cy - dh / 2, dw, dh);
        }
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.lineWidth = (isMob ? 4 : 6) + (pulse * 0.15); ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`; ctx.stroke();
      frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [audioData, isCameraOn, isScreenSharing, status, error]);

  const handleMessage = useCallback((text: string, isUser: boolean, complete: boolean) => {
    if (isUser) {
      setCurrentUserText(text);
      if (complete) { setHistory(p => [...p, { role: 'user', text, timestamp: Date.now() }]); setCurrentUserText(''); }
    } else {
      setCurrentAssistantText(text);
      if (complete) { setHistory(p => [...p, { role: 'assistant', text, timestamp: Date.now() }]); setCurrentAssistantText(''); }
    }
  }, []);

  useEffect(() => { historyEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history, currentAssistantText, currentUserText]);

  const stopVideo = () => {
    if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    setIsCameraOn(false); setIsScreenSharing(false);
  };

  const startStream = () => {
    frameIntervalRef.current = window.setInterval(() => {
      if (videoRef.current && processingCanvasRef.current && managerRef.current && status === ConnectionStatus.CONNECTED) {
        const v = videoRef.current; const c = processingCanvasRef.current; const ctx = c.getContext('2d');
        if (ctx && v.videoWidth > 0) {
          c.width = 640; c.height = (v.videoHeight / v.videoWidth) * c.width;
          ctx.drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(b => {
            if (b) {
              const r = new FileReader();
              r.onloadend = () => managerRef.current?.sendVideoFrame((r.result as string).split(',')[1]);
              r.readAsDataURL(b);
            }
          }, 'image/jpeg', 0.6);
        }
      }
    }, 1000);
  };

  const toggleCamera = async () => {
    if (isCameraOn) stopVideo();
    else {
      try {
        let stream;
        try { 
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); 
        } catch { 
          stream = await navigator.mediaDevices.getUserMedia({ video: true }); 
        }
        if (videoRef.current) { 
          videoRef.current.srcObject = stream; 
          setIsCameraOn(true); 
          setIsScreenSharing(false); 
          startStream(); 
        }
      } catch (err: any) {
        setError("I couldn't find a camera, Jamjam! Try screen sharing maybe?");
      }
    }
  };

  const toggleScreen = async () => {
    if (isScreenSharing) stopVideo();
    else {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (videoRef.current) { 
          videoRef.current.srcObject = s; 
          setIsScreenSharing(true); 
          setIsCameraOn(false); 
          startStream(); 
          s.getVideoTracks()[0].onended = stopVideo; 
        }
      } catch (e) { 
        console.warn(e); 
      }
    }
  };

  const toggleConn = async () => {
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      managerRef.current?.disconnect(); 
      stopVideo(); 
      setStatus(ConnectionStatus.IDLE); 
      setAudioData(new Uint8Array(0)); 
      setSecondsElapsed(0); 
      setCurrentAssistantText(''); 
      setCurrentUserText('');
    } else {
      setError(null); 
      setStatus(ConnectionStatus.CONNECTING);
      try {
        const m = new GeminiLiveManager(handleMessage, (err) => {
          setError(err);
          setStatus(ConnectionStatus.ERROR);
        }, setAudioData);
        await m.connect(); 
        managerRef.current = m; 
        setStatus(ConnectionStatus.CONNECTED);
      } catch (e: any) { 
        setStatus(ConnectionStatus.ERROR); 
      }
    }
  };

  return (
    <div className="h-screen-safe w-full flex flex-col overflow-hidden relative bg-[#fdfcf8] select-none text-[#5c633a]">
      {/* Background Decor */}
      <div className="absolute top-4 left-4 z-10 opacity-20 pointer-events-none">
        <Heart className="text-[#c5d299]" size={120} strokeWidth={0.5} />
      </div>

      <header className="relative z-20 flex items-center justify-between px-6 py-6 md:px-12 md:py-8">
        <div className="flex-1"><div className="p-2 bg-white/50 w-fit rounded-xl border border-[#5c633a]/5 shadow-sm"><Sparkles size={24} className="text-[#c5d299]" /></div></div>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3">
            {status === ConnectionStatus.CONNECTED && <div className="flex gap-1 items-center bg-[#c5d299]/10 px-3 py-1 rounded-full border border-[#c5d299]/20"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span className="text-[10px] font-bold uppercase tracking-widest">Live</span></div>}
            <h1 className="text-2xl md:text-3xl miles-font tracking-tight">Miles <span className="text-[#c5d299]">{formatTime(secondsElapsed)}</span></h1>
          </div>
          <p className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-40 mt-1">Created by Master E</p>
        </div>
        <div className="flex-1 flex justify-end">
          <button onClick={() => setShowHistory(!showHistory)} className="p-3 bg-white/50 rounded-xl border border-[#5c633a]/5 shadow-sm hover:bg-white relative transition-colors active:scale-95">
            <MessageSquare size={24} />
            {history.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#ff4d4d] rounded-full border-2 border-[#fdfcf8]" />}
          </button>
        </div>
      </header>

      <main className="flex-1 relative flex flex-col items-center justify-center py-4 px-6">
        <div className="relative group cursor-pointer" onClick={toggleConn}>
          <canvas ref={visualizerCanvasRef} className="w-[85vw] h-[85vw] max-h-[500px] max-w-[500px]" />
          
          {status === ConnectionStatus.IDLE && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40 group-hover:opacity-60 transition-all">
              <Play size={80} className="text-white drop-shadow-md" fill="currentColor" />
              <span className="mt-4 miles-font text-white text-xl">Let's Jam!</span>
            </div>
          )}

          {error && status !== ConnectionStatus.CONNECTING && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#ff4d4d] gap-4">
              <AlertCircle size={80} className="animate-bounce" />
              <button 
                onClick={(e) => { e.stopPropagation(); checkHardware(); }}
                className="bg-white/90 backdrop-blur-sm px-6 py-2 rounded-full border border-[#ff4d4d]/20 text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-white transition-all shadow-md active:scale-95"
              >
                <RefreshCw size={14} /> Refresh Hardware
              </button>
            </div>
          )}
        </div>
        <video ref={videoRef} autoPlay playsInline muted className="hidden" />
        <canvas ref={processingCanvasRef} className="hidden" />
      </main>

      <footer className="relative z-20 pb-12 flex flex-col items-center gap-8">
        {error && (
          <div className="absolute bottom-[100%] mb-4 p-4 bg-[#ff4d4d]/10 rounded-2xl border border-[#ff4d4d]/20 flex items-start gap-3 text-[#ff4d4d] max-w-[90%] shadow-lg animate-in slide-in-from-bottom-2 duration-300">
            <Info size={18} className="shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-bold leading-snug">{error}</p>
              <p className="text-[10px] opacity-60">Don't worry, Jamjam! Miles is here to help us try again!</p>
            </div>
          </div>
        )}

        <div className="bg-white/80 backdrop-blur-xl px-4 py-3 rounded-[2.5rem] flex items-center gap-4 shadow-[0_20px_50px_rgba(92,99,58,0.1)] border border-white">
          <button onClick={toggleCamera} disabled={!hasCam || status !== ConnectionStatus.CONNECTED} className={`p-3 rounded-full transition-all active:scale-90 ${isCameraOn ? 'bg-[#c5d299] text-white shadow-md' : 'text-[#5c633a]/60 hover:bg-[#5c633a]/5'} disabled:opacity-20`}><Camera size={24} /></button>
          <button onClick={toggleScreen} disabled={status !== ConnectionStatus.CONNECTED} className={`p-3 rounded-full transition-all active:scale-90 ${isScreenSharing ? 'bg-[#c5d299] text-white shadow-md' : 'text-[#5c633a]/60 hover:bg-[#5c633a]/5'} disabled:opacity-20`}><ScreenShare size={24} /></button>
          
          <button onClick={toggleConn} className={`p-5 md:p-6 rounded-full shadow-lg transition-all active:scale-95 ${status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING ? 'bg-[#ff6b6b] text-white hover:bg-[#ff5252]' : 'bg-[#5c633a] text-white hover:bg-[#4a502f]'}`}>
            {status === ConnectionStatus.CONNECTING ? <Loader2 size={32} className="animate-spin" /> : status === ConnectionStatus.CONNECTED ? <Square size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
          </button>

          <div className={`p-3 rounded-full transition-colors ${status === ConnectionStatus.CONNECTED ? 'bg-[#c5d299]/20 text-[#c5d299] animate-pulse' : 'text-[#5c633a]/30'}`}>
            <Mic size={24} />
          </div>
          <button className="text-[#5c633a]/60 p-3 hover:bg-[#5c633a]/5 rounded-full transition-colors"><Info size={24} /></button>
        </div>

        <div className="min-h-[4rem] px-10 text-center max-w-[90%] md:max-w-[600px]">
          <p className="text-base md:text-lg font-medium opacity-80 leading-relaxed transition-all duration-300">
            {status === ConnectionStatus.CONNECTED 
              ? (currentAssistantText || currentUserText || "I'm listening with all my ears, Jamjam!") 
              : status === ConnectionStatus.CONNECTING 
              ? "Waking up Miles... He's getting his thinking cap on!" 
              : error 
              ? "Oh-oh! Let's try fixing our connection, partner." 
              : "Ready to build something amazing today, Jamjam?"}
          </p>
        </div>
      </footer>

      {showHistory && (
        <div className="absolute inset-0 bg-[#5c633a]/10 backdrop-blur-md z-30 flex justify-end animate-in fade-in duration-300">
          <div className="h-full w-full md:w-[480px] bg-[#fdfcf8] border-l border-[#5c633a]/5 shadow-2xl flex flex-col p-8 md:p-12 animate-in slide-in-from-right duration-500">
            <div className="flex justify-between items-center mb-12">
              <div>
                <h2 className="text-3xl md:text-4xl miles-font text-[#5c633a]">Mentorship Log</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-2">Jamjam's Career Path</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-3 hover:bg-[#5c633a]/5 rounded-2xl transition-all active:scale-90 border border-transparent hover:border-[#5c633a]/5">
                <X size={28} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-10 pr-4 custom-scrollbar">
              {history.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-10 gap-6">
                  <MessageSquare size={80} strokeWidth={1} />
                  <p className="text-sm font-bold tracking-[0.3em] uppercase">The pages are waiting for us!</p>
                </div>
              )}
              {history.map((e, i) => (
                <div key={i} className="flex flex-col gap-3 group">
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${e.role === 'user' ? 'text-[#c5d299]' : 'text-[#5c633a]/30'}`}>
                    {e.role === 'user' ? 'Jamjam' : 'Miles'}
                  </span>
                  <div className={`text-lg md:text-xl leading-snug md:leading-relaxed ${e.role === 'user' ? 'text-[#5c633a]' : 'text-[#5c633a]/60'}`}>
                    {e.text}
                  </div>
                </div>
              ))}
              {(currentUserText || currentAssistantText) && (
                <div className="flex flex-col gap-3 animate-pulse opacity-40">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                    {currentUserText ? 'Jamjam' : 'Miles'}
                  </span>
                  <div className="text-lg md:text-xl italic">
                    {currentUserText || currentAssistantText}...
                  </div>
                </div>
              )}
              <div ref={historyEndRef} />
            </div>
          </div>
        </div>
      )}
      <style>{`
        .miles-font { font-family: 'Fredoka One', cursive; } 
        .custom-scrollbar::-webkit-scrollbar { width: 4px; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(92,99,58,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
