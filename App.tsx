
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GeminiLiveManager } from './services/geminiService.ts';
import { TranscriptionEntry, ConnectionStatus } from './types.ts';
import { 
  Mic, MicOff, Info, Square, MessageSquare, X, Camera, CameraOff, ScreenShare, MonitorOff, Play, User, Sparkles, Video, VideoOff, Monitor, Zap, Volume2, VolumeX, Radio, Phone, PhoneOff, Settings, Headphones, Music, Share2, ChevronDown
} from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.IDLE);
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [currentAssistantText, setCurrentAssistantText] = useState('');
  const [currentUserText, setCurrentUserText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<Uint8Array>(new Uint8Array(0));
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSystemAudioActive, setIsSystemAudioActive] = useState(false);
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>('default');

  const managerRef = useRef<GeminiLiveManager | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const feedbackAudioCtxRef = useRef<AudioContext | null>(null);

  const fetchOutputDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      setOutputDevices(outputs);
    } catch (err) {
      console.error("Error fetching audio devices", err);
    }
  }, []);

  useEffect(() => {
    if (showSettings) {
      fetchOutputDevices();
    }
  }, [showSettings, fetchOutputDevices]);

  const handleOutputDeviceChange = async (deviceId: string) => {
    setSelectedOutputDeviceId(deviceId);
    if (managerRef.current) {
      try {
        await managerRef.current.setOutputDevice(deviceId);
      } catch (err) {
        console.error("Failed to change output device", err);
      }
    }
  };

  const playFeedbackSound = (type: 'start' | 'stop') => {
    if (!feedbackAudioCtxRef.current) {
      feedbackAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = feedbackAudioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'start') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  };

  useEffect(() => {
    if (status === ConnectionStatus.CONNECTED) {
      timerIntervalRef.current = window.setInterval(() => setSecondsElapsed(prev => prev + 1), 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (status === ConnectionStatus.IDLE) setSecondsElapsed(0);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [status]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOn(true);
        setIsScreenSharing(false);
      }
    } catch (err) { console.error("Camera access denied", err); }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOn(false);
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsScreenSharing(true);
        setIsCameraOn(false);
        
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          setIsSystemAudioActive(true);
          managerRef.current?.addInputTrack(stream);
        }

        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          setIsSystemAudioActive(false);
          managerRef.current?.removeInputTrack(stream);
        };
      }
    } catch (err) { console.error("Screen share denied", err); }
  };

  const stopScreenShare = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    if (stream) {
      managerRef.current?.removeInputTrack(stream);
      stream.getTracks().forEach(t => t.stop());
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsScreenSharing(false);
    setIsSystemAudioActive(false);
  };

  const toggleMic = () => {
    const nextState = !isMicMuted;
    setIsMicMuted(nextState);
    managerRef.current?.setMicMuted(nextState);
  };

  const toggleSpeaker = () => {
    const nextState = !isSpeakerMuted;
    setIsSpeakerMuted(nextState);
    managerRef.current?.setSpeakerMuted(nextState);
  };

  const togglePhoneMode = () => {
    setIsPhoneMode(prev => !prev);
  };

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
    return () => { if (frameIntervalRef.current) clearInterval(frameIntervalRef.current); };
  }, [isCameraOn, isScreenSharing, status]);

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
      const isVideoActive = isCameraOn || isScreenSharing;
      const baseRadius = isVideoActive ? (isMobile ? 30 : 40) : (isMobile ? 65 : 85); 
      ctx.clearRect(0, 0, rect.width, rect.height);
      const now = Date.now();
      const breathing = Math.sin(now / 1500) * 5 + Math.sin(now / 800) * 2;
      let averageLevel = 0;
      if (audioData.length > 0) averageLevel = audioData.reduce((a, b) => a + b, 0) / audioData.length;
      const activePulse = (averageLevel / 255) * (isVideoActive ? 15 : (isMobile ? 40 : 60));
      const ringCount = isVideoActive ? 3 : (isMobile ? 6 : 8);
      for (let i = 1; i <= ringCount; i++) {
        const ringRadius = baseRadius + (i * (isVideoActive ? 8 : (isMobile ? 18 : 24))) + (breathing * 0.4);
        ctx.beginPath(); ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.lineWidth = 0.5; ctx.strokeStyle = `rgba(92, 99, 58, ${isVideoActive ? 0.1 : 0.03 - (i * 0.002)})`; ctx.stroke();
      }
      const coreRadius = baseRadius + (activePulse * 0.5) + (breathing * 0.5);
      ctx.beginPath(); ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = isPhoneMode ? 'rgba(59, 130, 246, 0.8)' : (isVideoActive ? 'rgba(197, 210, 153, 0.8)' : '#c5d299'); 
      ctx.fill();
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [audioData, isCameraOn, isScreenSharing, status, isPhoneMode]);

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

  const handleProfileUpdate = useCallback(() => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 3000);
  }, []);

  const toggleConnection = async () => {
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      playFeedbackSound('stop');
      managerRef.current?.disconnect();
      setStatus(ConnectionStatus.IDLE);
      setIsSystemAudioActive(false);
    } else {
      playFeedbackSound('start');
      setStatus(ConnectionStatus.CONNECTING);
      try {
        const manager = new GeminiLiveManager(handleMessage, (err) => setError(err), (data) => setAudioData(data), handleProfileUpdate);
        await manager.connect();
        manager.setMicMuted(isMicMuted);
        manager.setSpeakerMuted(isSpeakerMuted);
        if (selectedOutputDeviceId !== 'default') {
          await manager.setOutputDevice(selectedOutputDeviceId);
        }
        managerRef.current = manager;
        setStatus(ConnectionStatus.CONNECTED);
      } catch (err) { setStatus(ConnectionStatus.ERROR); }
    }
  };

  return (
    <div className="h-screen-safe w-full flex flex-col overflow-hidden relative bg-[#fdfcf8] select-none">
      <canvas ref={processingCanvasRef} className="hidden" />
      <header className="relative z-30 flex items-center justify-between px-6 py-6 md:px-10 md:py-10">
        <div className="flex-1 flex justify-start items-center gap-3">
          <button onClick={() => setShowSettings(true)} className="text-[#5c633a] hover:opacity-70 transition-opacity active:scale-95" title="Settings"><Settings size={28} /></button>
          <button onClick={toggleSpeaker} className={`p-2 rounded-full transition-all active:scale-90 ${isSpeakerMuted ? 'text-[#ff4d4d]' : 'text-[#5c633a] hover:opacity-70'}`} title="Toggle Speaker">
            {isSpeakerMuted ? <VolumeX size={28} /> : <Volume2 size={28} />}
          </button>
          {isSyncing && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#c5d299]/30 rounded-full animate-pulse border border-[#c5d299]/50">
               <Sparkles size={14} className="text-[#5c633a]" />
               <span className="text-[10px] font-bold text-[#5c633a] uppercase tracking-wider hidden sm:inline">Learning</span>
            </div>
          )}
          {isSystemAudioActive && (
             <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-100 rounded-full border border-blue-200">
                <Radio size={14} className="text-blue-600 animate-pulse" />
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider hidden sm:inline">System Audio</span>
             </div>
          )}
          {isPhoneMode && (
             <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500 rounded-full border border-blue-600">
                <Zap size={14} className="text-white animate-pulse" />
                <span className="text-[10px] font-bold text-white uppercase tracking-wider hidden sm:inline">Broadcasting</span>
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
        <div className={`absolute inset-0 transition-opacity duration-500 z-10 ${(isCameraOn || isScreenSharing) ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/10 pointer-events-none" />
        </div>
        <canvas ref={visualizerCanvasRef} className="relative z-20 w-full h-full max-h-[75vw] max-w-[75vw] md:max-h-[800px] md:max-w-[800px] pointer-events-none" />
      </main>

      <footer className="relative z-30 pb-8 md:pb-12 px-6 flex flex-col items-center gap-6 w-full">
        <div className={`text-sm md:text-base font-medium h-12 px-8 text-center w-full max-w-[600px] line-clamp-2 italic leading-snug transition-colors duration-300 ${(isCameraOn || isScreenSharing) ? 'text-white drop-shadow-md' : 'text-[#5c633a]/70'}`}>
          {status === ConnectionStatus.CONNECTED ? (currentAssistantText || currentUserText || "Miles is listening...") : "Ready to launch your career, Jamjam?"}
        </div>
        <div className="bg-[#f5f4e8]/90 backdrop-blur-xl px-4 py-3 rounded-full flex flex-wrap items-center justify-center gap-2 sm:gap-4 shadow-2xl border border-[#5c633a]/10">
          <button onClick={isCameraOn ? stopCamera : startCamera} className={`p-3 rounded-full transition-all active:scale-90 ${isCameraOn ? 'bg-[#5c633a] text-white' : 'hover:bg-[#5c633a]/10 text-[#5c633a]'}`} title="Toggle Camera">
            {isCameraOn ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
          <button onClick={toggleMic} className={`p-3 rounded-full transition-all active:scale-90 ${isMicMuted ? 'bg-[#ff4d4d] text-white' : 'hover:bg-[#5c633a]/10 text-[#5c633a]'}`} title="Toggle Mic">
            {isMicMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          
          <button onClick={toggleConnection} className={`p-5 rounded-full shadow-lg transition-all active:scale-95 flex items-center justify-center ${status === ConnectionStatus.CONNECTED ? 'bg-[#ff4d4d] text-white' : 'bg-[#5c633a] text-white'}`}>
            {status === ConnectionStatus.CONNECTED ? <Square size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
          </button>

          <button onClick={isScreenSharing ? stopScreenShare : startScreenShare} className={`p-3 rounded-full transition-all active:scale-90 ${isScreenSharing ? 'bg-[#5c633a] text-white' : 'hover:bg-[#5c633a]/10 text-[#5c633a]'}`} title="Screen Share">
            {isScreenSharing ? <MonitorOff size={22} /> : <Monitor size={22} />}
          </button>
          
          <button onClick={togglePhoneMode} className={`p-3 rounded-full transition-all active:scale-90 ${isPhoneMode ? 'bg-blue-500 text-white' : 'hover:bg-[#5c633a]/10 text-[#5c633a]'}`} title="Phone Call Mode">
            {isPhoneMode ? <PhoneOff size={22} /> : <Phone size={22} />}
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
              {history.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-[#5c633a]/40 gap-4">
                  <MessageSquare size={48} />
                  <p className="font-medium">No sessions logged yet, Jamjam.</p>
                </div>
              )}
              {history.map((entry, i) => (
                <div key={i} className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] px-5 py-3 rounded-2xl ${entry.role === 'user' ? 'bg-[#5c633a] text-white rounded-tr-none' : 'bg-[#f5f4e8] text-[#5c633a] rounded-tl-none border border-[#5c633a]/5'}`}>
                    <p className="text-sm leading-relaxed">{entry.text}</p>
                    <span className="text-[10px] opacity-40 mt-1 block">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] z-50 flex justify-start">
          <div className="h-full w-full md:w-[450px] bg-[#fdfcf8] shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="flex items-center justify-between px-8 py-10 border-b border-[#5c633a]/5">
              <h2 className="text-2xl font-bold text-[#5c633a]">Configuration</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 bg-[#5c633a]/5 rounded-full"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-10 space-y-12">
              
              <section className="space-y-6">
                <div className="flex items-center gap-3 text-[#5c633a]">
                   <Headphones size={20} className="opacity-70" />
                   <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Audio Input (What Miles Hears)</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-5 bg-[#f5f4e8] rounded-2xl border border-[#5c633a]/5">
                    <div className="space-y-1">
                      <p className="font-bold text-[#5c633a]">System Audio Mix</p>
                      <p className="text-xs text-[#5c633a]/60">Allow Miles to hear your speakers/Internal audio.</p>
                    </div>
                    <button 
                      onClick={() => isScreenSharing ? stopScreenShare() : startScreenShare()}
                      className={`w-14 h-8 rounded-full transition-colors relative ${isSystemAudioActive ? 'bg-blue-500' : 'bg-[#5c633a]/20'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${isSystemAudioActive ? 'left-7' : 'left-1'} shadow-sm`} />
                    </button>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex gap-3">
                    <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-600 leading-relaxed">
                      To enable system audio, use the <strong>Screen Share</strong> toggle. Miles can then listen to videos or music with you.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex items-center gap-3 text-[#5c633a]">
                   <Volume2 size={20} className="opacity-70" />
                   <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Miles's Voice Output</h3>
                </div>
                <div className="space-y-4">
                  <div className="p-5 bg-[#f5f4e8] rounded-2xl border border-[#5c633a]/5 space-y-3">
                    <p className="font-bold text-[#5c633a]">Output Device</p>
                    <div className="relative group">
                      <select 
                        value={selectedOutputDeviceId}
                        onChange={(e) => handleOutputDeviceChange(e.target.value)}
                        className="w-full appearance-none bg-white px-4 py-3 pr-10 rounded-xl border border-[#5c633a]/10 text-sm text-[#5c633a] focus:outline-none focus:ring-2 focus:ring-[#c5d299] transition-all"
                      >
                        <option value="default">System Default</option>
                        {outputDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Output Device ${device.deviceId.slice(0, 5)}`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5c633a]/40 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex items-center gap-3 text-[#5c633a]">
                   <Phone size={20} className="opacity-70" />
                   <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Output Routing (Phone Call Mode)</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-5 bg-[#f5f4e8] rounded-2xl border border-[#5c633a]/5">
                    <div className="space-y-1">
                      <p className="font-bold text-[#5c633a]">Master Broadcast</p>
                      <p className="text-xs text-[#5c633a]/60">Mix Mic + AI voice into one stream for calls.</p>
                    </div>
                    <button 
                      onClick={togglePhoneMode}
                      className={`w-14 h-8 rounded-full transition-colors relative ${isPhoneMode ? 'bg-blue-500' : 'bg-[#5c633a]/20'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${isPhoneMode ? 'left-7' : 'left-1'} shadow-sm`} />
                    </button>
                  </div>
                  
                  <div className="p-5 bg-white rounded-2xl border border-[#5c633a]/10 space-y-4">
                    <div className="flex items-center gap-2">
                       <Share2 size={16} className="text-[#5c633a]" />
                       <p className="text-xs font-bold text-[#5c633a] uppercase">Integration Steps</p>
                    </div>
                    <ol className="text-[11px] text-[#5c633a]/70 space-y-3 list-decimal ml-4 leading-relaxed">
                      <li>Enable <strong>Master Broadcast</strong> above.</li>
                      <li>Miles will mix your voice and his into a single hidden stream.</li>
                      <li>Use a virtual audio driver (like Loopback or VB-Audio) to route this browser tab to your phone app's microphone input.</li>
                    </ol>
                  </div>
                </div>
              </section>

              <section className="pt-6 border-t border-[#5c633a]/5">
                 <div className="flex items-center justify-between text-[#5c633a]/40 text-[10px] font-bold uppercase tracking-tighter">
                    <span>Miles Engine v2.5</span>
                    <span>Created with ❤️ by Master E</span>
                 </div>
              </section>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
