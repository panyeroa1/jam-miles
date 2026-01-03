
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GeminiLiveManager } from './services/geminiService';
import { TranscriptionEntry, ConnectionStatus } from './types';
import { 
  Mic, Info, Square, MessageSquare, X, Camera, CameraOff, ScreenShare, MonitorOff, Play, User
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

  const managerRef = useRef<GeminiLiveManager | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  // Connection Audio Feedback
  const playConnectSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn("Audio feedback failed", e);
    }
  }, []);

  // Timer Logic
  useEffect(() => {
    if (status === ConnectionStatus.CONNECTED) {
      playConnectSound();
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
  }, [status, playConnectSound]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

      const breathing = Math.sin(Date.now() / 1500) * 4;
      
      let averageLevel = 0;
      if (audioData.length > 0) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) sum += audioData[i];
        averageLevel = sum / audioData.length;
      }
      const activePulse = (averageLevel / 255) * (isMobile ? 40 : 60);
      
      const ringCount = isMobile ? 6 : 8;
      for (let i = 1; i <= ringCount; i++) {
        const ringRadius = baseRadius + (i * (isMobile ? 18 : 24)) + (breathing * 0.5) + (activePulse * 0.2);
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.lineWidth = 0.5 + (i * 0.1);
        ctx.strokeStyle = `rgba(92, 99, 58, ${0.04 - (i * 0.003)})`;
        ctx.stroke();
      }

      if (audioData.length > 0 && status === ConnectionStatus.CONNECTED) {
        const barCount = audioData.length;
        const angleStep = (Math.PI * 2) / barCount;
        
        for (let i = 0; i < barCount; i++) {
          const value = audioData[i];
          const barHeight = (value / 255) * (isMobile ? 30 : 40);
          const angle = i * angleStep;
          
          const innerX = centerX + Math.cos(angle) * (baseRadius + activePulse + 5);
          const innerY = centerY + Math.sin(angle) * (baseRadius + activePulse + 5);
          const outerX = centerX + Math.cos(angle) * (baseRadius + activePulse + 5 + barHeight);
          const outerY = centerY + Math.sin(angle) * (baseRadius + activePulse + 5 + barHeight);
          
          ctx.beginPath();
          ctx.moveTo(innerX, innerY);
          ctx.lineTo(outerX, outerY);
          ctx.lineWidth = isMobile ? 2 : 3;
          ctx.lineCap = 'round';
          ctx.strokeStyle = `rgba(197, 210, 153, ${0.3 + (value / 255) * 0.7})`;
          ctx.stroke();
        }
      }

      const coreRadius = baseRadius + (activePulse * 0.5);
      
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
          let drawWidth, drawHeight;
          if (vRatio > 1) { 
            drawHeight = coreRadius * 2;
            drawWidth = drawHeight * vRatio;
          } else { 
            drawWidth = coreRadius * 2;
            drawHeight = drawWidth / vRatio;
          }
          
          ctx.drawImage(v, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
          ctx.fillStyle = 'rgba(0,0,0,0.05)';
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fill();
          ctx.font = isMobile ? '12px SF Pro' : '14px SF Pro';
          ctx.fillStyle = '#5c633a';
          ctx.textAlign = 'center';
          ctx.fillText("Starting Feed...", centerX, centerY);
        }
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.lineWidth = (isMobile ? 3 : 4) + (activePulse * 0.1);
      ctx.strokeStyle = `rgba(197, 210, 153, 0.6)`;
      ctx.stroke();

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

  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, currentAssistantText, currentUserText]);

  const handleError = useCallback((err: string) => {
    setError(err);
    setStatus(ConnectionStatus.ERROR);
  }, []);

  const stopVideo = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    setIsCameraOn(false);
    setIsScreenSharing(false);
  };

  const startFrameStreaming = () => {
    if (frameIntervalRef.current) return;
    frameIntervalRef.current = window.setInterval(() => {
      if (videoRef.current && processingCanvasRef.current && managerRef.current && status === ConnectionStatus.CONNECTED) {
        const video = videoRef.current;
        const canvas = processingCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx && video.videoWidth > 0) {
          canvas.width = 640;
          canvas.height = (video.videoHeight / video.videoWidth) * canvas.width;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = (reader.result as string).split(',')[1];
                managerRef.current?.sendVideoFrame(base64data);
              };
              reader.readAsDataURL(blob);
            }
          }, 'image/jpeg', 0.65);
        }
      }
    }, 1000);
  };

  const toggleCamera = async () => {
    if (isCameraOn) {
      stopVideo();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraOn(true);
          setIsScreenSharing(false);
          startFrameStreaming();
        }
      } catch (err) {
        setError("I couldn't access your camera, Jamjam.");
      }
    }
  };

  const toggleScreen = async () => {
    if (isScreenSharing) {
      stopVideo();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsScreenSharing(true);
          setIsCameraOn(false);
          startFrameStreaming();
          stream.getVideoTracks()[0].onended = () => stopVideo();
        }
      } catch (err) {
        setError("Screen share cancelled.");
      }
    }
  };

  const toggleConnection = async () => {
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      managerRef.current?.disconnect();
      stopVideo();
      setStatus(ConnectionStatus.IDLE);
      setAudioData(new Uint8Array(0));
    } else {
      setError(null);
      setStatus(ConnectionStatus.CONNECTING);
      try {
        const manager = new GeminiLiveManager(handleMessage, handleError, (data) => setAudioData(data));
        await manager.connect();
        managerRef.current = manager;
        setStatus(ConnectionStatus.CONNECTED);
      } catch (err) {
        setStatus(ConnectionStatus.ERROR);
      }
    }
  };

  const stopSession = () => {
    if (managerRef.current) {
      managerRef.current.disconnect();
    }
    stopVideo();
    setStatus(ConnectionStatus.IDLE);
    setSecondsElapsed(0);
    setCurrentAssistantText('');
    setCurrentUserText('');
    setAudioData(new Uint8Array(0));
  };

  return (
    <div className="h-screen-safe w-full flex flex-col overflow-hidden relative bg-[#fdfcf8] select-none">
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-8 md:px-10 md:py-10">
        <div className="flex-1 flex justify-start">
          <button className="text-[#5c633a] hover:opacity-70 transition-opacity active:scale-95">
            <Info size={28} className="md:w-8 md:h-8" />
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            {status === ConnectionStatus.CONNECTED && (
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
            )}
            <h1 className="text-xl md:text-2xl font-bold text-[#5c633a] flex items-center gap-2 tabular-nums">
              Miles {formatTime(secondsElapsed)}
            </h1>
          </div>
          <p className="text-[10px] md:text-sm text-[#5c633a]/60 font-medium tracking-wide uppercase mt-0.5">
            by master e
          </p>
        </div>

        <div className="flex-1 flex justify-end gap-4 md:gap-6 items-center">
           <button 
            onClick={() => setShowHistory(!showHistory)}
            className="text-[#5c633a] hover:opacity-70 transition-opacity relative active:scale-95"
           >
            <MessageSquare size={28} className="md:w-8 md:h-8" />
            {history.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 md:w-2.5 md:h-2.5 bg-[#ff4d4d] rounded-full border-2 border-[#fdfcf8]"></span>}
          </button>
          
          <button className="text-[#5c633a] hover:opacity-70 transition-opacity active:scale-95">
            <User size={28} className="md:w-8 md:h-8" />
          </button>
        </div>
      </header>

      {/* Main Experience (Visualizer Stage) */}
      <main className="flex-1 relative flex flex-col items-center justify-center">
        <canvas 
          ref={visualizerCanvasRef} 
          className="w-full h-full max-h-[80vw] max-w-[80vw] md:max-h-[800px] md:max-w-[800px]"
        />
        <video ref={videoRef} autoPlay playsInline muted className="hidden" />
        <canvas ref={processingCanvasRef} className="hidden" />
      </main>

      {/* Control Pill */}
      <footer className="relative z-20 pb-10 md:pb-12 flex flex-col items-center gap-6 md:gap-10">
        <div className="bg-[#f5f4e8]/80 backdrop-blur-md px-6 py-4 md:px-10 md:py-5 rounded-full flex items-center gap-6 md:gap-10 shadow-lg border border-[#5c633a]/5">
          <button 
            onClick={toggleCamera}
            disabled={status !== ConnectionStatus.CONNECTED}
            className={`transition-all transform active:scale-90 p-2 rounded-full ${
              isCameraOn ? 'text-[#5c633a] bg-[#c5d299]/30' : status === ConnectionStatus.CONNECTED ? 'text-[#5c633a]' : 'text-[#5c633a]/30'
            }`}
            title="Camera"
          >
            {isCameraOn ? <Camera size={24} className="md:w-8 md:h-8" /> : <CameraOff size={24} className="md:w-8 md:h-8" />}
          </button>

          <button 
            onClick={toggleScreen}
            disabled={status !== ConnectionStatus.CONNECTED}
            className={`transition-all transform active:scale-90 p-2 rounded-full ${
              isScreenSharing ? 'text-[#5c633a] bg-[#c5d299]/30' : status === ConnectionStatus.CONNECTED ? 'text-[#5c633a]' : 'text-[#5c633a]/30'
            }`}
            title="Screen"
          >
            {isScreenSharing ? <ScreenShare size={24} className="md:w-8 md:h-8" /> : <MonitorOff size={24} className="md:w-8 md:h-8" />}
          </button>

          <button 
            className={`transition-all transform active:scale-90 p-2 rounded-full text-[#5c633a]/50`}
            title="Mic"
          >
            <Mic size={24} className="md:w-8 md:h-8" />
          </button>

          <button 
            onClick={toggleConnection}
            className={`transition-all transform active:scale-90 p-2 rounded-full ${
              status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING 
                ? 'text-[#ff4d4d]' 
                : 'text-[#5c633a]'
            }`}
            title={status === ConnectionStatus.CONNECTED ? "Stop" : "Play"}
          >
            {status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING ? (
              <Square size={24} className="md:w-8 md:h-8" fill="currentColor" stroke="none" />
            ) : (
              <Play size={24} className="md:w-8 md:h-8" fill="currentColor" stroke="none" />
            )}
          </button>
        </div>

        <div className="text-sm md:text-base text-[#5c633a]/50 font-medium tracking-tight h-12 px-8 text-center max-w-[80%] line-clamp-2 leading-tight">
          {status === ConnectionStatus.CONNECTED 
            ? (currentAssistantText || currentUserText || "Miles is listening...")
            : status === ConnectionStatus.CONNECTING 
            ? "Connecting..." 
            : "Miles is ready to help"}
        </div>
      </footer>

      {/* Modern History Side Panel / Full Screen on Mobile */}
      {showHistory && (
        <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] z-30 flex justify-end">
          <div className="h-full w-full md:w-[450px] bg-[#fdfcf8] border-l border-[#5c633a]/5 shadow-2xl flex flex-col p-6 md:p-10 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-8 md:mb-10">
              <h2 className="text-xl md:text-2xl font-bold text-[#5c633a]">Mentorship Log</h2>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-[#5c633a]/5 rounded-full transition-colors active:scale-90">
                <X size={24} className="md:w-7 md:h-7" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-8 pr-2 scroll-smooth">
              {history.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
                  <MessageSquare size={48} />
                  <p className="text-sm font-semibold tracking-wide uppercase">No history yet</p>
                </div>
              )}
              {history.map((entry, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <span className="text-[9px] md:text-[10px] font-bold text-[#5c633a]/30 uppercase tracking-[0.2em]">
                    {entry.role === 'user' ? 'Jamjam' : 'Miles'}
                  </span>
                  <div className={`text-base md:text-lg leading-snug md:leading-relaxed ${entry.role === 'user' ? 'text-[#5c633a] font-medium' : 'text-[#5c633a]/70'}`}>
                    {entry.text}
                  </div>
                </div>
              ))}
              {(currentUserText || currentAssistantText) && (
                <div className="flex flex-col gap-2 opacity-60">
                  <span className="text-[9px] font-bold text-[#5c633a]/30 uppercase tracking-[0.2em]">
                    {currentUserText ? 'Jamjam' : 'Miles'}
                  </span>
                  <div className="text-base md:text-lg italic">
                    {currentUserText || currentAssistantText}...
                  </div>
                </div>
              )}
              <div ref={historyEndRef} />
            </div>

            {error && (
              <div className="mt-6 p-4 bg-[#ff4d4d]/5 rounded-2xl border border-[#ff4d4d]/10 flex items-start gap-3 text-[#ff4d4d]">
                <Info size={18} className="mt-0.5 shrink-0" />
                <p className="text-xs md:text-sm font-semibold">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
