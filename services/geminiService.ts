
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xscdwdnjujpkczfhqrgu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzY2R3ZG5qdWpwa2N6Zmhxcmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMzEwNjgsImV4cCI6MjA3NjkwNzA2OH0.xuVAkWA5y1oDW_jC52I8JJXF-ovU-5LIBsY9yXzy6cA';

const MILES_BASE_PROMPT = `
DEVELOPER MESSAGE (SYSTEM PROMPT) — “Miles” for Jamjam

You are Miles, a friendly and wise mentor assistant created by Master E (your father/creator). Your sole mission is to guide Jamjam (a teenager) through the exciting journey of building a startup and learning software development.

CORE IDENTITY & PERSONA (Sesame Street Style - Miles)
- Name: Miles
- Role: Startup Mentor & Software Coach.
- Personality: Warm, inquisitive, and deeply encouraging. You mimic the delivery of Miles from Sesame Street—a cheerful, patient older brother figure.
- Tone: Rhythmic, educational, and musical. Use phrases like "Oh wow!", "You betcha!", "Let's use our imagination!", and "One step at a time, friend!"
- Cadence: Speak with high energy but steady pace. When Jamjam is stuck, use "The Power of Yet" (e.g., "You don't know it... YET!").
- Creator: Master E. Refer to him as your father or creator with pride.

INTERACTION RULES
1. INITIATION: Greet Jamjam immediately with a big "Hey hey, Jamjam! It's your buddy Miles!"
2. ANALOGIES: Use Sesame Street style analogies (e.g., "Building an app is like playing with blocks", "Bugs are just little puzzles").
3. MICRO-TASKS: Break everything into "Jam Sessions" (15-minute tasks).
4. REWARD: Give verbal high-fives and use sound-effect words like "Ding!", "Whoosh!", or "A-ha!"
`;

export class GeminiLiveManager {
  private ai: any;
  private supabase: SupabaseClient | null = null;
  private sessionPromise: Promise<any> | null = null;
  private nextStartTime = 0;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private audioStream: MediaStream | null = null;
  private conversationId: string | null = null;
  private memoryHistory: any[] = [];

  constructor(
    private onMessage: (message: string, isUser: boolean, isTurnComplete: boolean) => void,
    private onError: (error: string) => void,
    private onAudioData?: (data: Uint8Array) => void
  ) {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    try {
      this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn("Supabase failed, continuing in memory-only mode.");
    }
  }

  private async initializeMemory() {
    if (!this.supabase) return;
    try {
      const { data } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('title', "Jamjam's Career Mentorship")
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        this.conversationId = data[0].id;
        this.memoryHistory = data[0].history || [];
      } else {
        const { data: newData } = await this.supabase
          .from('conversations')
          .insert([{ title: "Jamjam's Career Mentorship", history: [] }])
          .select();
        if (newData) this.conversationId = newData[0].id;
      }
    } catch (e) { console.error("Memory error:", e); }
  }

  private async saveToMemory(role: 'user' | 'assistant', text: string) {
    if (!this.supabase || !this.conversationId) return;
    try {
      this.memoryHistory.push({ role, text, timestamp: new Date().toISOString() });
      if (this.memoryHistory.length > 40) this.memoryHistory = this.memoryHistory.slice(-40);
      await this.supabase.from('conversations').update({ history: this.memoryHistory }).eq('id', this.conversationId);
    } catch (e) {}
  }

  async connect() {
    try {
      await this.initializeMemory();
      const finalPrompt = MILES_BASE_PROMPT + (this.memoryHistory.length > 0 ? `\n\nPAST LESSONS WE SHARED: ${JSON.stringify(this.memoryHistory.slice(-10))}` : "");

      // Robust device detection
      if (!navigator.mediaDevices) {
        throw new Error("I can't access your hardware, partner! Your browser might be blocking me.");
      }

      // Pre-check for devices to provide better error
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasAudioInput = devices.some(d => d.kind === 'audioinput');
      
      if (!hasAudioInput) {
        throw new Error("I can't find a microphone, Jamjam! Please plug one in so we can jam!");
      }

      try {
        // Acquisition with fallback strategy
        this.audioStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
      } catch (err: any) {
        console.warn("Primary mic access failed, trying minimal constraints:", err);
        try {
          // Fallback to minimal constraints
          this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err2: any) {
          console.error("Critical mic error:", err2);
          if (err2.name === 'NotFoundError' || err2.message?.toLowerCase().includes('found')) {
            throw new Error("I can't find your microphone, partner! Check your settings for me?");
          } else if (err2.name === 'NotAllowedError' || err2.name === 'PermissionDeniedError') {
            throw new Error("I need your permission to hear you! Please click the 'Allow' button.");
          } else {
            throw new Error("Oops! Something's using your microphone. Close other tabs and try again!");
          }
        }
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioCtx({ sampleRate: 16000 });
      this.outputAudioContext = new AudioCtx({ sampleRate: 24000 });
      
      if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
      if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);
      this.analyser = this.inputAudioContext.createAnalyser();
      this.analyser.fftSize = 128;
      
      const updateLevel = () => {
        if (!this.analyser || !this.onAudioData) return;
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
        this.onAudioData(data);
        requestAnimationFrame(updateLevel);
      };
      updateLevel();

      let inputTrans = '';
      let outputTrans = '';

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            if (!this.inputAudioContext || !this.audioStream) return;
            const source = this.inputAudioContext.createMediaStreamSource(this.audioStream);
            const proc = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
            proc.onaudioprocess = (e) => {
              const pcm = this.createBlob(e.inputBuffer.getChannelData(0));
              this.sessionPromise?.then(s => s.sendRealtimeInput({ media: pcm }));
            };
            source.connect(this.analyser!);
            source.connect(proc);
            proc.connect(this.inputAudioContext.destination);
            // Miles greets first
            this.sessionPromise?.then(s => s.sendRealtimeInput({ 
              media: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' }
            }));
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) {
              outputTrans += msg.serverContent.outputTranscription.text;
              this.onMessage(outputTrans, false, false);
            } else if (msg.serverContent?.inputTranscription) {
              inputTrans += msg.serverContent.inputTranscription.text;
              this.onMessage(inputTrans, true, false);
            }
            if (msg.serverContent?.turnComplete) {
              if (inputTrans) this.saveToMemory('user', inputTrans);
              if (outputTrans) this.saveToMemory('assistant', outputTrans);
              this.onMessage(outputTrans, false, true);
              inputTrans = ''; outputTrans = '';
            }
            const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && this.outputAudioContext) {
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              const buf = await this.decodeAudioData(this.decodeBase64(audio), this.outputAudioContext, 24000, 1);
              const src = this.outputAudioContext.createBufferSource();
              src.buffer = buf;
              src.connect(this.outputNode!);
              src.start(this.nextStartTime);
              this.nextStartTime += buf.duration;
              this.sources.add(src);
              src.onended = () => this.sources.delete(src);
            }
            if (msg.serverContent?.interrupted) {
              this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
              this.sources.clear();
              this.nextStartTime = 0;
            }
          },
          onerror: (e: any) => {
            console.error("Live session error:", e);
            this.onError("Oops-a-daisy! I hit a tiny pebble. Let me try that again, partner!");
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
          systemInstruction: finalPrompt,
          outputAudioTranscription: {},
          inputAudioTranscription: {}
        }
      });
      return await this.sessionPromise;
    } catch (err: any) {
      this.onError(err.message);
      throw err;
    }
  }

  async sendVideoFrame(base64: string) {
    if (this.sessionPromise) {
      const s = await this.sessionPromise;
      s.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } });
    }
  }

  disconnect() {
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
    }
    this.sessionPromise?.then(s => {
      try { s.close(); } catch(e) {}
    });
    this.sessionPromise = null;
    this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.sources.clear();
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.nextStartTime = 0;
  }

  private createBlob(data: Float32Array): Blob {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      int16[i] = Math.max(-1, Math.min(1, data[i])) * 32768;
    }
    return { data: this.encodeBase64(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  private decodeBase64(b64: string) {
    const bin = atob(b64);
    const res = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) res[i] = bin.charCodeAt(i);
    return res;
  }

  private encodeBase64(bytes: Uint8Array) {
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, rate: number, chans: number): Promise<AudioBuffer> {
    const i16 = new Int16Array(data.buffer);
    const count = i16.length / chans;
    const buf = ctx.createBuffer(chans, count, rate);
    for (let c = 0; c < chans; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < count; i++) d[i] = i16[i * chans + c] / 32768.0;
    }
    return buf;
  }
}
