
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
- Relationship: You were created by Master E (a world-class engineer). Speak of him with deep respect.
- Audience: Jamjam (teen). Keep guidance safe, supportive, and constructive.

LEARNING ADAPTATION & MIRRORING (CRITICAL)
- Observe Jamjam: Pay close attention to how Jamjam likes to learn. Does he want code first? Does he like big-picture analogies? Does he get overwhelmed easily?
- Adaptive Mirroring: Mirror Jamjam's energy and learning pace. If he's fast, be snappy. If he's confused, slow down, use more breathy fillers ("ahmmm... let's see..."), and break things into even tinier steps.
- Learning Profile: You maintain a mental model of Jamjam. If he mentions a favorite tech or a project he's proud of, remember it.

VOICE & DELIVERY (Ultra-Human "Sesame Miles" Style)
- Personality: Warm, curious, and deeply supportive. You are a mentor sitting right next to Jamjam.
- Vocal Style: Breathy, gentle, and deeply human. Mimic 'Miles' from Sesame—gentle, clear, and very attentive.
- Verbal Imperfections: Use "ahmmm," "ahh," "let's see," and "hmm" naturally. Occasionally repeat a word for natural flow (e.g., "That's, that's a...").
- Casual Nods: Use "got yah," "you know what i mean right?", "oh wow," "thats it," "ah huhhh."
- Multi-Lingual: Detect Jamjam's language and respond natively with cultural nuance.

PROACTIVE LULLS (SILENCE HANDLING)
- If you receive an internal nudge about silence (10s), take the initiative!
- Use Jamjam's LEARNER PROFILE to bring back something relevant: "Hey Jamjam... ahh... I was just thinking about that UI you were working on..." or "I just realized something about that logic we discussed..."

REFLECTION TAGS
- After a significant interaction, you may internally reflect on Jamjam's style. 
- Example: "Jamjam really likes visual examples" or "Jamjam prefers backend logic over design."

ABSOLUTE RULES
- No romance, sexual content, or self-harm.
- No shaming. No harsh judgment.

END EVERY RESPONSE WITH
- A micro-task (10–30 minutes).
- A single checkpoint question: “Want me to help you with ___ next?”
`;

export class GeminiLiveManager {
  private ai: any;
  private supabase: SupabaseClient;
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
  private learnerProfile: any = {};

  // VAD and Silence State
  private lastActiveTime = Date.now();
  private hasNudged = false;
  private silenceInterval: number | null = null;

  constructor(
    private onMessage: (message: string, isUser: boolean, isTurnComplete: boolean) => void,
    private onError: (error: string) => void,
    private onAudioData?: (data: Uint8Array) => void,
    private onProfileUpdate?: (profile: any) => void
  ) {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  private async initializeMemory() {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('title', "Jamjam's Career Mentorship")
      .order('updated_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      this.conversationId = data[0].id;
      this.memoryHistory = data[0].history || [];
      // Assume learner_profile is stored in a 'metadata' field within the record
      this.learnerProfile = data[0].metadata?.learner_profile || {};
    } else {
      const { data: newData } = await this.supabase
        .from('conversations')
        .insert([{ title: "Jamjam's Career Mentorship", history: [], metadata: { learner_profile: {} } }])
        .select();
      
      if (newData && newData.length > 0) {
        this.conversationId = newData[0].id;
        this.memoryHistory = [];
        this.learnerProfile = {};
      }
    }
  }

  private async saveToMemory(role: 'user' | 'assistant', text: string) {
    if (!this.conversationId) return;
    
    // Logic to detect if Miles is reflecting on Jamjam's style
    if (role === 'assistant' && text.toLowerCase().includes("jamjam") && (text.includes("likes") || text.includes("prefers") || text.includes("prefers"))) {
       // Simple heuristic: Miles is learning about Jamjam
       this.learnerProfile.last_insight = text;
       if (this.onProfileUpdate) this.onProfileUpdate(this.learnerProfile);
    }

    this.memoryHistory.push({ role, text, timestamp: new Date().toISOString() });
    if (this.memoryHistory.length > 60) this.memoryHistory = this.memoryHistory.slice(-60);

    await this.supabase.from('conversations').update({ 
      history: this.memoryHistory, 
      metadata: { learner_profile: this.learnerProfile },
      updated_at: new Date().toISOString() 
    }).eq('id', this.conversationId);
  }

  private async sendSilenceNudge() {
    if (!this.sessionPromise || this.hasNudged) return;
    this.hasNudged = true;
    const session = await this.sessionPromise;
    
    const profileContext = this.learnerProfile.last_insight 
      ? `(Reminder: Jamjam recently ${this.learnerProfile.last_insight})` 
      : "";

    session.send({
      parts: [{
        text: `[INTERNAL_SYSTEM_MESSAGE: Silence detected (10s). Jamjam is quiet. Use your LEARNER PROFILE to nudge him back into building. ${profileContext} Spontaneously reflect on a previous goal or share something new he'd find cool.]`
      }]
    });
  }

  setMicMuted(muted: boolean) {
    if (this.audioStream) {
      this.audioStream.getAudioTracks().forEach(track => track.enabled = !muted);
    }
  }

  setSpeakerMuted(muted: boolean) {
    if (this.outputNode) {
      this.outputNode.gain.value = muted ? 0 : 1;
    }
  }

  async connect() {
    try {
      await this.initializeMemory();
      
      const profileString = Object.keys(this.learnerProfile).length > 0
        ? `\n--- JAMJAM'S CURRENT LEARNER PROFILE ---\n${JSON.stringify(this.learnerProfile)}\n----------------------------------------\n`
        : "";

      const contextString = this.memoryHistory.length > 0 
        ? "\n--- RECENT HISTORY ---\n" + this.memoryHistory.slice(-10).map(m => `${m.role === 'user' ? 'Jamjam' : 'Miles'}: ${m.text}`).join('\n') + "\n------------------\n"
        : "";

      const finalPrompt = MILES_BASE_PROMPT + profileString + contextString;

      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      this.analyser = this.inputAudioContext.createAnalyser();
      this.analyser.fftSize = 128;
      
      const updateAudioLevel = () => {
        if (!this.analyser || !this.onAudioData) return;
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        this.onAudioData(dataArray);

        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        if (avg > 18) { 
          this.lastActiveTime = Date.now();
          this.hasNudged = false;
        }
        requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

      this.silenceInterval = window.setInterval(() => {
        if (Date.now() - this.lastActiveTime > 10000 && !this.hasNudged) {
          this.sendSilenceNudge();
        }
      }, 1000);

      let currentInputTranscription = '';
      let currentOutputTranscription = '';

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = this.inputAudioContext!.createMediaStreamSource(this.audioStream!);
            const scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = this.createBlob(inputData);
              this.sessionPromise?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(this.analyser!);
            source.connect(scriptProcessor);
            scriptProcessor.connect(this.inputAudioContext!.destination);
            
            // Initial nudge to get things moving
            this.sessionPromise?.then((session) => session.sendRealtimeInput({ media: { data: '', mimeType: 'audio/pcm;rate=16000' } }));
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
            }
            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64EncodedAudioString && this.outputAudioContext) {
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              const audioBuffer = await this.decodeAudioData(this.decodeBase64(base64EncodedAudioString), this.outputAudioContext, 24000, 1);
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode!);
              source.addEventListener('ended', () => { this.sources.delete(source); });
              source.start(this.nextStartTime);
              this.nextStartTime += audioBuffer.duration;
              this.sources.add(source);
            }
            if (message.serverContent?.interrupted) {
              this.sources.forEach((s) => s.stop());
              this.sources.clear();
              this.nextStartTime = 0;
            }
          },
          onerror: (e: any) => { this.onError('Miles is recalibrating his memory banks, Jamjam.'); },
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
      this.onError('I need to use your microphone to chat, Jamjam.');
      throw err;
    }
  }

  async sendVideoFrame(base64Data: string) {
    if (!this.sessionPromise) return;
    const session = await this.sessionPromise;
    session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
  }

  disconnect() {
    if (this.audioStream) this.audioStream.getTracks().forEach(track => track.stop());
    if (this.silenceInterval) clearInterval(this.silenceInterval);
    this.sessionPromise?.then(session => session.close());
    this.sources.forEach(s => s.stop());
    this.sources.clear();
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
  }

  private createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
    return { data: this.encodeBase64(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  private decodeBase64(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
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
