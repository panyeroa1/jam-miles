
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GeminiLiveManager } from './services/geminiService';
import { TranscriptionEntry, ConnectionStatus } from './types';
import { 
  Mic, Info, Square, MessageSquare, X, Camera, CameraOff, ScreenShare, MonitorOff, Play, User, ChevronRight, Sparkles, Video, VideoOff, Monitor, Zap
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
  const [isSyncing, setIsSyncing] = useState(false);

  const managerRef = useRef<GeminiLiveManager | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  // Timer Logic
  useEffect(() => {
    if (status === ConnectionStatus.CONNECTED) {
      timerIntervalRef.current = window.setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (status === ConnectionStatus.IDLE) setSecondsElapsed(0);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [status]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Video Streaming Logic
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOn(true);
        setIsScreenSharing(false);
      }
    } catch (err) {
      console.error("Camera access denied", err);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOn(false);
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsScreenSharing(true);
        setIsCameraOn(false);
        stream.getVideoTracks()[0].onended = () => setIsScreenSharing(false);
      }
    } catch (err) {
      console.error("Screen share denied", err);
    }
  };

  const stopScreenShare = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsScreenSharing(false);
  };

  // Frame processing for Gemini
  useEffect(() => {
    if ((isCameraOn || isScreenSharing) && status === ConnectionStatus.CONNECTED) {
      frameIntervalRef.current = window.setInterval(() => {
        if (!videoRef.current || !processingCanvasRef.current) return;
        const canvas = processingCanvasRef.current;
        const video = videoRef.current;
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        managerRef.current?.sendVideoFrame(base64);
      }, 1000);
    } else {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    }
    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
  }, [isCameraOn, isScreenSharing, status]);

  // Canvas Visualizer Drawing
  useEffect(() => {
    const canvas = visualizerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const isMobile = rect.width < 640;
      const baseRadius = isMobile ? 65 : 85; 
      ctx.clearRect(0, 0, rect.width, rect.height);
      const now = Date.now();
      const breathing = Math.sin(now / 1500) * 5 + Math.sin(now / 800) * 2;
      let averageLevel = 0;
      if (audioData.length > 0) {
        averageLevel = audioData.reduce((a, b) => a + b, 0) / audioData.length;
      }
      const activePulse = (averageLevel / 255) * (isMobile ? 40 : 60);
      const ringCount = isMobile ? 6 : 8;
      for (let i = 1; i <= ringCount; i++) {
        const ringRadius = baseRadius + (i * (isMobile ? 18 : 24)) + (breathing * 0.4);
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = `rgba(92, 99, 58, ${0.03 - (i * 0.002)})`;
        ctx.stroke();
      }
      const coreRadius = baseRadius + (activePulse * 0.5) + (breathing * 0.5);
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#c5d299';
      ctx.fill();

      if (isCameraOn || isScreenSharing) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
        ctx.clip();
        const v = videoRef.current;
        if (v && v.readyState >= v.HAVE_ENOUGH_DATA) {
          const vRatio = v.videoWidth / v.videoHeight;
          let drawWidth = coreRadius * 2, drawHeight = coreRadius * 2;
          if (vRatio > 1) drawWidth = drawHeight * vRatio; else drawHeight = drawWidth / vRatio;
          ctx.drawImage(v, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
        }
        ctx.restore();
      }
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [audioData, isCameraOn, isScreenSharing, status]);

  const handleMessage = useCallback((text: string, isUser: boolean, isTurnComplete: boolean) => {
    if (isUser) {
      setCurrentUserText(text);
      if (isTurnComplete) {
        setHistory(prev => [...prev, { role: 'user', text, timestamp: Date.now() }]);
        setCurrentUserText('');
      }
    } else {
      setCurrentAssistantText(text);
      if (isTurnComplete) {
        setHistory(prev => [...prev, { role: 'assistant', text, timestamp: Date.now() }]);
        setCurrentAssistantText('');
      }
    }
  }, []);

  const handleProfileUpdate = useCallback((profile: any) => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 3000);
  }, []);

  const toggleConnection = async () => {
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      managerRef.current?.disconnect();
      setStatus(ConnectionStatus.IDLE);
    } else {
      setStatus(ConnectionStatus.CONNECTING);
      try {
        const manager = new GeminiLiveManager(handleMessage, (err) => setError(err), (data) => setAudioData(data), handleProfileUpdate);
        await manager.connect();
        managerRef.current = manager;
        setStatus(ConnectionStatus.CONNECTED);
      } catch (err) {
        setStatus(ConnectionStatus.ERROR);
      }
    }
  };

  return (
    <div className="h-screen-safe w-full flex flex-col overflow-hidden relative bg-[#fdfcf8] select-none">
      {/* Hidden processing tools */}
      <canvas ref={processingCanvasRef} className="hidden" />
      
      <header className="relative z-20 flex items-center justify-between px-6 py-6 md:px-10 md:py-10">
        <div className="flex-1 flex justify-start items-center gap-2">
          <button className="text-[#5c633a] hover:opacity-70 transition-opacity active:scale-95">
            <Info size={28} />
          </button>
          {isSyncing && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#c5d299]/30 rounded-full animate-pulse border border-[#c5d299]/50">
               <Sparkles size={14} className="text-[#5c633a]" />
               <span className="text-[10px] font-bold text-[#5c633a] uppercase tracking-wider hidden sm:inline">Learning Jamjam</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center">
          <h1 className="text-xl md:text-2xl font-bold text-[#5c633a] tabular-nums">Miles {formatTime(secondsElapsed)}</h1>
          <p className="text-[10px] md:text-sm text-[#5c633a]/60 font-medium uppercase tracking-widest">by master e</p>
        </div>
        <div className="flex-1 flex justify-end gap-4 md:gap-6 items-center">
           <button onClick={() => setShowHistory(!showHistory)} className="text-[#5c633a] relative active:scale-95">
            <MessageSquare size={28} />
            {history.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#ff4d4d] rounded-full border-2 border-[#fdfcf8]"></span>}
          </button>
          <button className="text-[#5c633a] active:scale-95"><User size={28} /></button>
        </div>
      </header>

      <main className="flex-1 relative flex flex-col items-center justify-center">
        <canvas ref={visualizerCanvasRef} className="w-full h-full max-h-[75vw] max-w-[75vw] md:max-h-[800px] md:max-w-[800px]" />
        <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      </main>

      <footer className="relative z-20 pb-8 md:pb-12 px-6 flex flex-col items-center gap-6 w-full">
        {/* Main Status Text */}
        <div className="text-sm md:text-base text-[#5c633a]/70 font-medium h-12 px-8 text-center w-full max-w-[600px] line-clamp-2 italic leading-snug">
          {status === ConnectionStatus.CONNECTED ? (currentAssistantText || currentUserText || "Miles is listening...") : "Ready to launch your career, Jamjam?"}
        </div>

        {/* Action Bar */}
        <div className="bg-[#f5f4e8]/90 backdrop-blur-xl px-2 py-2 rounded-full flex items-center gap-2 sm:gap-4 shadow-2xl border border-[#5c633a]/10">
          
          {/* Camera Toggle */}
          <button 
            onClick={isCameraOn ? stopCamera : startCamera}
            className={`p-3 sm:p-4 rounded-full transition-all active:scale-90 ${isCameraOn ? 'bg-[#5c633a] text-white' : 'hover:bg-[#5c633a]/5 text-[#5c633a]'}`}
            title="Toggle Camera"
          >
            {isCameraOn ? <VideoOff size={24} /> : <Video size={24} />}
          </button>

          {/* Screen Share Toggle */}
          <button 
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            className={`p-3 sm:p-4 rounded-full transition-all active:scale-90 ${isScreenSharing ? 'bg-[#5c633a] text-white' : 'hover:bg-[#5c633a]/5 text-[#5c633a]'}`}
            title="Screen Share"
          >
            {isScreenSharing ? <MonitorOff size={24} /> : <Monitor size={24} />}
          </button>

          {/* Center Play/Stop Button */}
          <div className="h-10 w-[1px] bg-[#5c633a]/10 mx-1"></div>
          
          <button 
            onClick={toggleConnection} 
            className={`p-4 sm:p-5 rounded-full shadow-lg transition-all active:scale-95 flex items-center justify-center ${status === ConnectionStatus.CONNECTED ? 'bg-[#ff4d4d] text-white hover:bg-[#ff3333]' : 'bg-[#5c633a] text-white hover:opacity-90'}`}
          >
            {status === ConnectionStatus.CONNECTED ? <Square size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
          </button>
          
          <div className="h-10 w-[1px] bg-[#5c633a]/10 mx-1"></div>

          {/* Quick Idea / Insight Button */}
          <button 
            className="p-3 sm:p-4 rounded-full text-[#5c633a] hover:bg-[#5c633a]/5 transition-all active:scale-90"
            onClick={() => {
              if (status === ConnectionStatus.CONNECTED) {
                // Internal "Quick Insight" request
                managerRef.current?.sendVideoFrame(''); // Trigger nudge if empty frame logic exists
              }
            }}
            title="Quick Insight"
          >
            <Zap size={24} />
          </button>

          {/* Mic Visualizer / Status (Indicator only) */}
          <div className="p-3 sm:p-4 rounded-full text-[#5c633a] opacity-40">
            <Mic size={24} />
          </div>

        </div>
      </footer>

      {showHistory && (
        <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] z-30 flex justify-end">
          <div className="h-full w-full md:w-[450px] bg-[#fdfcf8] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-8 py-10 border-b border-[#5c633a]/5">
              <h2 className="text-2xl font-bold text-[#5c633a]">Mentorship Log</h2>
              <button onClick={() => setShowHistory(false)} className="p-2 bg-[#5c633a]/5 rounded-full transition-colors hover:bg-[#5c633a]/10"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
              {history.map((entry, i) => (
                <div key={i} className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] px-5 py-3 rounded-2xl ${entry.role === 'user' ? 'bg-[#5c633a] text-white rounded-tr-none' : 'bg-[#f5f4e8] text-[#5c633a] rounded-tl-none border border-[#5c633a]/5'}`}>
                    <p className="text-sm leading-relaxed">{entry.text}</p>
                    <span className="text-[10px] opacity-40 mt-1 block">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-[#5c633a]/30 gap-3">
                   <MessageSquare size={48} />
                   <p className="font-medium">No messages yet. Say hi to Miles!</p>
                </div>
              )}
              <div ref={historyEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
