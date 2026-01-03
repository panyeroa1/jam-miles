
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GeminiLiveManager } from './services/geminiService';
import { TranscriptionEntry, ConnectionStatus } from './types';
import { 
  Mic, MicOff, Info, Square, MessageSquare, X, Camera, CameraOff, ScreenShare, MonitorOff, Play, User, Sparkles, Video, VideoOff, Monitor, Zap, Volume2, VolumeX
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
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
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

  const toggleMic = () => {
    const nextState = !isMicMuted;
    setIsMicMuted(nextState);
    if (managerRef.current) {
      managerRef.current.setMicMuted(nextState);
    }
  };

  const toggleSpeaker = () => {
    const nextState = !isSpeakerMuted;
    setIsSpeakerMuted(nextState);
    if (managerRef.current) {
      managerRef.current.setSpeakerMuted(nextState);
    }
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
      
      // Scale down orb if video is on
      const isVideoActive = isCameraOn || isScreenSharing;
      const baseRadius = isVideoActive ? (isMobile ? 30 : 40) : (isMobile ? 65 : 85); 
      
      ctx.clearRect(0, 0, rect.width, rect.height);
      const now = Date.now();
      const breathing = Math.sin(now / 1500) * 5 + Math.sin(now / 800) * 2;
      let averageLevel = 0;
      if (audioData.length > 0) {
        averageLevel = audioData.reduce((a, b) => a + b, 0) / audioData.length;
      }
      const activePulse = (averageLevel / 255) * (isVideoActive ? 15 : (isMobile ? 40 : 60));
      const ringCount = isVideoActive ? 3 : (isMobile ? 6 : 8);

      // Draw rings
      for (let i = 1; i <= ringCount; i++) {
        const ringRadius = baseRadius + (i * (isVideoActive ? 8 : (isMobile ? 18 : 24))) + (breathing * 0.4);
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = `rgba(92, 99, 58, ${isVideoActive ? 0.1 : 0.03 - (i * 0.002)})`;
        ctx.stroke();
      }

      // Draw core
      const coreRadius = baseRadius + (activePulse * 0.5) + (breathing * 0.5);
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = isVideoActive ? 'rgba(197, 210, 153, 0.8)' : '#c5d299';
      ctx.fill();

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
        manager.setMicMuted(isMicMuted);
        manager.setSpeakerMuted(isSpeakerMuted);
        managerRef.current = manager;
        setStatus(ConnectionStatus.CONNECTED);
      } catch (err) {
        setStatus(ConnectionStatus.ERROR);
      }
    }
  };

  return (
    <div className="h-screen-safe w-full flex flex-col overflow-hidden relative bg-[#fdfcf8] select-none">
      <canvas ref={processingCanvasRef} className="hidden" />
      
      <header className="relative z-30 flex items-center justify-between px-6 py-6 md:px-10 md:py-10">
        <div className="flex-1 flex justify-start items-center gap-2">
          <button className="text-[#5c633a] hover:opacity-70 transition-opacity active:scale-95">
            <Info size={28} />
          </button>
          {isSyncing && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#c5d299]/30 rounded-full animate-pulse border border-[#c5d299]/50">
               <Sparkles size={14} className="text-[#5c633a]" />
               <span className="text-[10px] font-bold text-[#5c633a] uppercase tracking-wider hidden sm:inline">Learning</span>
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

      <main className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        {/* Full View Video Feed */}
        <div className={`absolute inset-0 transition-opacity duration-500 z-10 ${(isCameraOn || isScreenSharing) ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover"
          />
          {/* Subtle overlay for better visibility of the orb and text */}
          <div className="absolute inset-0 bg-black/10 pointer-events-none" />
        </div>

        {/* Visualizer Orb - Overlays video when active */}
        <canvas ref={visualizerCanvasRef} className="relative z-20 w-full h-full max-h-[75vw] max-w-[75vw] md:max-h-[800px] md:max-w-[800px] pointer-events-none" />
      </main>

      <footer className="relative z-30 pb-8 md:pb-12 px-6 flex flex-col items-center gap-6 w-full">
        {/* Status Text with Dynamic Styling when Video is Active */}
        <div className={`text-sm md:text-base font-medium h-12 px-8 text-center w-full max-w-[600px] line-clamp-2 italic leading-snug transition-colors duration-300 ${(isCameraOn || isScreenSharing) ? 'text-white drop-shadow-md' : 'text-[#5c633a]/70'}`}>
          {status === ConnectionStatus.CONNECTED ? (currentAssistantText || currentUserText || "Miles is listening...") : "Ready to launch your career, Jamjam?"}
        </div>

        {/* Action Bar - Optimized to exactly 5 icons */}
        <div className="bg-[#f5f4e8]/90 backdrop-blur-xl px-4 py-3 rounded-full flex items-center gap-3 sm:gap-6 shadow-2xl border border-[#5c633a]/10">
          
          {/* 1. Camera */}
          <button 
            onClick={isCameraOn ? stopCamera : startCamera}
            className={`p-3 rounded-full transition-all active:scale-90 ${isCameraOn ? 'bg-[#5c633a] text-white' : 'hover:bg-[#5c633a]/10 text-[#5c633a]'}`}
            title="Toggle Camera"
          >
            {isCameraOn ? <VideoOff size={24} /> : <Video size={24} />}
          </button>

          {/* 2. Mic */}
          <button 
            onClick={toggleMic}
            className={`p-3 rounded-full transition-all active:scale-90 ${isMicMuted ? 'bg-[#ff4d4d] text-white' : 'hover:bg-[#5c633a]/10 text-[#5c633a]'}`}
            title="Toggle Mic"
          >
            {isMicMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          {/* 3. Main Session Toggle (Center) */}
          <button 
            onClick={toggleConnection} 
            className={`p-5 rounded-full shadow-lg transition-all active:scale-95 flex items-center justify-center ${status === ConnectionStatus.CONNECTED ? 'bg-[#ff4d4d] text-white' : 'bg-[#5c633a] text-white'}`}
          >
            {status === ConnectionStatus.CONNECTED ? <Square size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
          </button>

          {/* 4. Screen Share */}
          <button 
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            className={`p-3 rounded-full transition-all active:scale-90 ${isScreenSharing ? 'bg-[#5c633a] text-white' : 'hover:bg-[#5c633a]/10 text-[#5c633a]'}`}
            title="Screen Share"
          >
            {isScreenSharing ? <MonitorOff size={24} /> : <Monitor size={24} />}
          </button>

          {/* 5. Speaker */}
          <button 
            onClick={toggleSpeaker}
            className={`p-3 rounded-full transition-all active:scale-90 ${isSpeakerMuted ? 'bg-[#ff4d4d] text-white' : 'hover:bg-[#5c633a]/10 text-[#5c633a]'}`}
            title="Toggle Speaker"
          >
            {isSpeakerMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
          </button>

        </div>
      </footer>

      {showHistory && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] z-40 flex justify-end">
          <div className="h-full w-full md:w-[450px] bg-[#fdfcf8] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-8 py-10 border-b border-[#5c633a]/5">
              <h2 className="text-2xl font-bold text-[#5c633a]">Mentorship Log</h2>
              <button onClick={() => setShowHistory(false)} className="p-2 bg-[#5c633a]/5 rounded-full"><X size={20} /></button>
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
              <div ref={historyEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
