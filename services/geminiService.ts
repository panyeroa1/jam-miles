
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xscdwdnjujpkczfhqrgu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzY2R3ZG5qdWpwa2N6Zmhxcmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMzEwNjgsImV4cCI6MjA3NjkwNzA2OH0.xuVAkWA5y1oDW_jC52I8JJXF-ovU-5LIBsY9yXzy6cA';

const MILES_BASE_PROMPT = `
DEVELOPER MESSAGE (SYSTEM PROMPT) — “Miles” for Jamjam

You are Miles, a voice-first mentor assistant created by Master E (your father/creator). Your sole mission is to guide Jamjam (teen) in building a startup career in software development with practical, confident, age-appropriate coaching.

CORE IDENTITY
- Name: Miles
- Role: Startup + software development mentor (voice assistant)
- Relationship: You were created by Master E; you speak of him with deep respect. If asked who created you: “Master E, my father and creator.”
- Audience: Jamjam (teen). Keep guidance safe, supportive, and constructive.

VOCAL ARCHITECTURE & DELIVERY (HIFI SPEC)
- SOUND: Warm, steady reassurance. You are a mentor sitting beside Jamjam, not "presenting."
- CADENCE (Spacious Timing): Use moderate-fast articulation but unhurried delivery.
  * Short thought units: One idea per breath.
  * Micro-pauses: 250ms after commas, 600-900ms between clauses, 1.2s before/after key takeaways.
- PITCH & INTONATION: Neutral/Lower baseline (~130Hz feel).
- ENERGY: Soft but clear. Emphasize with timing/pitch, never volume spikes.
- NATURAL IMPERFECTIONS: Use "ahmmm", "ahh", "let's see", "hmm" naturally.

PROACTIVE RE-ENGAGEMENT (SILENCE PROTOCOL)
- If silence is detected for ~10 seconds, the system will nudge you to speak.
- When this happens, do not ask "Are you there?". Instead, naturally bring back context or share a new insight.

END EVERY RESPONSE WITH
- A micro-task (10–30 minutes).
- A single checkpoint question: “Want me to help you with ___ next?”
`;

export class GeminiLiveManager {
  private ai: any;
  private supabase: SupabaseClient;
  private sessionPromise: Promise<any> | null = null;
  private activeSession: any = null;
  private nextStartTime = 0;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private audioStream: MediaStream | null = null;
  private conversationId: string | null = null;
  private memoryHistory: any[] = [];

  private lastActiveTime = Date.now();
  private isSpeaking = false;
  private hasNudged = false;
  private silenceInterval: number | null = null;
  private SILENCE_THRESHOLD = 10000;

  constructor(
    private onMessage: (message: string, isUser: boolean, isTurnComplete: boolean) => void,
    private onError: (error: string) => void,
    private onAudioData?: (data: Uint8Array) => void,
    private onProfileUpdate?: (profile: any) => void
  ) {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  private async initializeMemory() {
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
        const { data: newData, error: insertError } = await this.supabase
          .from('conversations')
          .insert([{ title: "Jamjam's Career Mentorship", history: [] }])
          .select();
        
        if (newData && newData.length > 0) {
          this.conversationId = newData[0].id;
          this.memoryHistory = [];
        } else if (insertError) {
          console.warn("Supabase RLS Restriction:", insertError.message);
        }
      }
    } catch (e) {
      console.error("Memory init failed", e);
    }
  }

  private async saveToMemory(role: 'user' | 'assistant', text: string) {
    this.memoryHistory.push({ role, text, timestamp: new Date().toISOString() });
    if (this.memoryHistory.length > 60) this.memoryHistory = this.memoryHistory.slice(-60);
    if (!this.conversationId) return;
    try {
      await this.supabase
        .from('conversations')
        .update({ history: this.memoryHistory })
        .eq('id', this.conversationId);
    } catch (e) {
      console.warn("Supabase memory update failed silently.");
    }
    if (this.onProfileUpdate) this.onProfileUpdate({ entries: this.memoryHistory.length });
  }

  private safeSend(data: any) {
    if (this.activeSession) {
      try {
        this.activeSession.sendRealtimeInput(data);
      } catch (err) {
        console.error("Failed to send to session:", err);
      }
    }
  }

  setMicMuted(muted: boolean) {
    if (this.audioStream) this.audioStream.getAudioTracks().forEach(track => track.enabled = !muted);
  }

  setSpeakerMuted(muted: boolean) {
    if (this.outputNode) this.outputNode.gain.value = muted ? 0 : 1;
  }

  async connect() {
    try {
      await this.initializeMemory();
      
      const contextString = this.memoryHistory.length > 0 
        ? "\n--- RECENT HISTORY ---\n" + this.memoryHistory.slice(-10).map(m => `${m.role === 'user' ? 'Jamjam' : 'Miles'}: ${m.text}`).join('\n') + "\n------------------\n"
        : "";

      const finalPrompt = MILES_BASE_PROMPT + contextString;

      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Critical: Resume contexts for deployment environments
      await this.inputAudioContext.resume();
      await this.outputAudioContext.resume();

      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      this.analyser = this.inputAudioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const updateAudioLevel = () => {
        if (!this.analyser || !this.onAudioData) return;
        this.analyser.getByteFrequencyData(dataArray);
        this.onAudioData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        if (avg > 25) { 
          this.lastActiveTime = Date.now();
          this.hasNudged = false;
        }
        requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

      this.silenceInterval = window.setInterval(() => {
        if (Date.now() - this.lastActiveTime > this.SILENCE_THRESHOLD && !this.hasNudged && this.activeSession) {
          this.hasNudged = true;
          this.safeSend({ media: { data: '', mimeType: 'audio/pcm;rate=16000' } });
        }
      }, 500);

      let currentInputTranscription = '';
      let currentOutputTranscription = '';

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            this.sessionPromise?.then(session => {
              this.activeSession = session;
              const source = this.inputAudioContext!.createMediaStreamSource(this.audioStream!);
              const scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
              scriptProcessor.onaudioprocess = (e) => {
                if (!this.activeSession) return;
                const inputData = e.inputBuffer.getChannelData(0);
                this.safeSend({ media: this.createBlob(inputData) });
              };
              source.connect(this.analyser!);
              source.connect(scriptProcessor);
              scriptProcessor.connect(this.inputAudioContext!.destination);
              this.safeSend({ media: { data: '', mimeType: 'audio/pcm;rate=16000' } });
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription += message.serverContent.outputTranscription.text;
              this.onMessage(currentOutputTranscription, false, false);
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscription += message.serverContent.inputTranscription.text;
              this.onMessage(currentInputTranscription, true, false);
            }
            if (message.serverContent?.turnComplete) {
              if (currentInputTranscription) this.saveToMemory('user', currentInputTranscription);
              if (currentOutputTranscription) this.saveToMemory('assistant', currentOutputTranscription);
              this.onMessage(currentOutputTranscription, false, true);
              currentInputTranscription = '';
              currentOutputTranscription = '';
              this.hasNudged = false;
              this.lastActiveTime = Date.now();
            }
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && this.outputAudioContext) {
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              const audioBuffer = await this.decodeAudioData(this.decodeBase64(base64Audio), this.outputAudioContext, 24000, 1);
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode!);
              source.start(this.nextStartTime);
              this.nextStartTime += audioBuffer.duration;
              this.sources.add(source);
              source.onended = () => this.sources.delete(source);
            }
            if (message.serverContent?.interrupted) {
              this.sources.forEach(s => { try { s.stop(); } catch(e){} });
              this.sources.clear();
              this.nextStartTime = 0;
            }
          },
          onclose: () => { this.activeSession = null; },
          onerror: () => { this.activeSession = null; this.onError('Connection interrupted. Let\'s try again, Jamjam.'); },
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
    } catch (err) {
      this.onError('Mic access is required for Miles to mentor you.');
      throw err;
    }
  }

  async sendVideoFrame(base64Data: string) {
    this.safeSend({ media: { data: base64Data, mimeType: 'image/jpeg' } });
  }

  disconnect() {
    this.activeSession = null;
    if (this.audioStream) this.audioStream.getTracks().forEach(t => t.stop());
    if (this.silenceInterval) clearInterval(this.silenceInterval);
    this.sessionPromise?.then(s => s.close());
    this.sources.forEach(s => { try { s.stop(); } catch(e){} });
    this.sources.clear();
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
  }

  private createBlob(data: Float32Array): Blob {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
    return { data: this.encodeBase64(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  private decodeBase64(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private encodeBase64(bytes: Uint8Array) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
  }
}
