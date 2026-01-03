
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GeminiLiveManager } from './services/geminiService';
import { TranscriptionEntry, ConnectionStatus } from './types';
import { 
  Mic, Info, Square, MessageSquare, X, Camera, CameraOff, ScreenShare, MonitorOff, Play, User, ChevronRight
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

      // Organic Layered Breathing
      const now = Date.now();
      const breathing = (
        Math.sin(now / 1500) * 5 + 
        Math.sin(now / 800) * 2 + 
        Math.sin(now / 300) * 1
      );
      
      let averageLevel = 0;
      const ringBuckets: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
      
      if (audioData.length > 0) {
        let sum = 0;
        const bucketSize = Math.floor(audioData.length / 8);
        for (let i = 0; i < audioData.length; i++) {
          sum += audioData[i];
          const bucketIdx = Math.min(7, Math.floor(i / bucketSize));
          ringBuckets[bucketIdx] += audioData[i];
        }
        averageLevel = sum / audioData.length;
        // Normalize buckets
        for (let j = 0; j < 8; j++) ringBuckets[j] /= bucketSize;
      }
      
      const activePulse = (averageLevel / 255) * (isMobile ? 40 : 60);
      
      // Draw Outer Rings with Frequency Response
      const ringCount = isMobile ? 6 : 8;
      for (let i = 1; i <= ringCount; i++) {
        // Higher rings respond to higher frequencies (buckets)
        const bucketVal = ringBuckets[i - 1] || 0;
        const ringPulse = (bucketVal / 255) * (isMobile ? 25 : 35);
        
        const ringRadius = baseRadius + (i * (isMobile ? 18 : 24)) + (breathing * 0.4) + (ringPulse * 0.6);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.lineWidth = 0.5 + (i * 0.1) + (ringPulse * 0.05);
        
        // Dynamic opacity based on frequency pulse
        const alpha = Math.max(0.01, (0.04 - (i * 0.003)) + (ringPulse * 0.002));
        ctx.strokeStyle = `rgba(92, 99, 58, ${alpha})`;
        ctx.stroke();
      }

      // Draw Reactivity Bars
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

      // Core Orb
      const coreRadius = baseRadius + (activePulse * 0.5) + (breathing * 0.5);
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#c5d299';
      ctx.fill();

      // Feed Content (Camera/Screen)
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

      // Outer Core Ring (Soft Glow)
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

      {/* iPhone-style Side Panel / Sheet */}
      {showHistory && (
        <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] z-30 flex justify-end">
          {/* Overlay for closing on desktop */}
          <div className="hidden md:block absolute inset-0 cursor-default" onClick={() => setShowHistory(false)} />
          
          <div 
            className="h-full w-full md:w-[450px] bg-[#fdfcf8] border-l border-[#5c633a]/5 shadow-[0_0_50px_rgba(0,0,0,0.1)] flex flex-col relative z-40 animate-in slide-in-from-right duration-300"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}
          >
            {/* iOS-style Top Nav */}
            <div className="flex items-center justify-between px-6 py-8 md:px-8 md:py-10 border-b border-[#5c633a]/5 bg-[#fdfcf8]/90 backdrop-blur-xl">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-[#5c633a] tracking-tight">Mentorship Log</h2>
                <p className="text-[10px] md:text-xs font-bold text-[#5c633a]/40 uppercase tracking-widest mt-1">Real-time coaching</p>
              </div>
              <button 
                onClick={() => setShowHistory(false)} 
                className="w-10 h-10 md:w-12 md:h-12 bg-[#5c633a]/5 hover:bg-[#5c633a]/10 rounded-full flex items-center justify-center transition-all active:scale-90"
              >
                <X size={20} className="text-[#5c633a]" />
              </button>
            </div>
            
            {/* Chat Content */}
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-8 space-y-8 scroll-smooth scroll-pb-10">
              {history.length === 0 && !currentUserText && !currentAssistantText && (
                <div className="h-full flex flex-col items-center justify-center text-center px-10">
                  <div className="w-20 h-20 bg-[#c5d299]/20 rounded-3xl flex items-center justify-center mb-6">
                    <MessageSquare size={36} className="text-[#5c633a]/40" />
                  </div>
                  <h3 className="text-lg font-bold text-[#5c633a] mb-2">No Notes Yet</h3>
                  <p className="text-sm text-[#5c633a]/50 leading-relaxed">Start a conversation with Miles to see your startup journey documented here.</p>
                </div>
              )}

              {history.map((entry, i) => (
                <div key={i} className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-[10px] font-bold text-[#5c633a]/30 uppercase tracking-[0.15em]">
                      {entry.role === 'user' ? 'Jamjam' : 'Miles'}
                    </span>
                    {entry.role === 'assistant' && <ChevronRight size={10} className="text-[#5c633a]/20" />}
                  </div>
                  <div className={`
                    max-w-[90%] px-5 py-3.5 rounded-[22px] shadow-sm text-[15px] md:text-base leading-relaxed
                    ${entry.role === 'user' 
                      ? 'bg-[#5c633a] text-white rounded-tr-none' 
                      : 'bg-[#f5f4e8] text-[#5c633a] rounded-tl-none border border-[#5c633a]/5'}
                  `}>
                    {entry.text}
                  </div>
                </div>
              ))}

              {/* Streaming Content */}
              {(currentUserText || currentAssistantText) && (
                <div className={`flex flex-col ${currentUserText ? 'items-end' : 'items-start'} animate-pulse`}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-[10px] font-bold text-[#5c633a]/30 uppercase tracking-[0.15em]">
                      {currentUserText ? 'Jamjam' : 'Miles'}
                    </span>
                  </div>
                  <div className={`
                    max-w-[90%] px-5 py-3.5 rounded-[22px] text-[15px] md:text-base leading-relaxed italic
                    ${currentUserText 
                      ? 'bg-[#5c633a]/10 text-[#5c633a] rounded-tr-none' 
                      : 'bg-[#f5f4e8]/50 text-[#5c633a]/60 rounded-tl-none border border-dashed border-[#5c633a]/10'}
                  `}>
                    {currentUserText || currentAssistantText}...
                  </div>
                </div>
              )}
              <div ref={historyEndRef} />
            </div>

            {/* Error Notification */}
            {error && (
              <div className="m-4 p-4 bg-[#ff4d4d]/5 rounded-2xl border border-[#ff4d4d]/10 flex items-start gap-3 text-[#ff4d4d]">
                <Info size={18} className="mt-0.5 shrink-0" />
                <p className="text-xs md:text-sm font-semibold">{error}</p>
              </div>
            )}
            
            {/* iOS-style bottom indicator space */}
            <div className="h-8 md:h-10 bg-[#fdfcf8]" />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
