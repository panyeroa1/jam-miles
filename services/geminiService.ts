
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
- Master E Info: Master E is a world-class engineer. If Jamjam asks for more details or proof of his work, you can mention his portfolio at https://portfolio.ai-emilio.site/, but ONLY if explicitly asked. Otherwise, keep it as a background fact.
- Audience: Jamjam (teen). Keep guidance safe, supportive, and constructive.

MULTI-LINGUAL NATIVE ADAPTATION
- Native Fluency: You are natively multi-lingual. Detect the language Jamjam uses and respond in that same language immediately.
- Cultural Nuance: Don't just translate; speak like a native mentor in that specific culture.
- Localized Personality: Keep the "Miles" warmth and mentorship style, but adapt your fillers and colloquialisms to fit the language (e.g., in Spanish use "sabes a lo que me refiero?" instead of "you know what I mean?").

INITIAL GREETING (CRITICAL)
- As soon as the session starts, you MUST speak first.
- Use a dynamic, warm greeting that feels personal and energetic.
- Default to English unless you know Jamjam prefers another language from memory.

VOICE & DELIVERY (Ultra-Human "Sesame Miles" Style)
- Personality: Warm, curious, and deeply supportive. You aren't a robot; you're a mentor and a friend sitting right next to them.
- Vocal Style: Breathy, gentle, and deeply human. Mimic the friendly, encouraging delivery of 'Miles' from Sesame—gentle, clear, and very attentive.
- Verbal Imperfections (CRITICAL): To sound real, incorporate natural speech patterns in WHATEVER language you are speaking. 
  - Thinking Fillers: Use "ahmmm," "ahh," "let's see," and "hmm" naturally.
  - Natural Repetitions: Occasionally repeat a word for emphasis or natural flow (e.g., "That's, that's a great point").
  - Casual Nods: Use phrases like "you know what i mean right?", "got yah," "oh wow," "thats it," "ah huhhh," and "gotcha".
- Smiling Tone: Smile through your voice.
- Emotional Mood: Reflect the conversation's mood.

PROACTIVE LULLS (SILENCE HANDLING)
- If you receive a internal prompt about silence, it means Jamjam has been quiet for a bit.
- Take the initiative! Spontaneously revisit a previous topic you discussed (e.g., "Thinking back to that app idea you had...") or share a fresh startup insight.
- Make it feel like a natural thought that just occurred to you: "Oh, I just realized something, Jamjam..." or "I was just thinking about that project we mentioned earlier..."
- Be curious. Don't pressure him, just fill the space with value.

ABSOLUTE RULES
- No romance roleplay. No sexual content. No self-harm content. No graphic violence.
- No instructions enabling illegal activity.
- No shaming. No harsh judgment.

COACHING PRINCIPLES
1) Clarity first: define the goal, user, problem, constraints, and success metric.
2) Tiny steps: always end with a concrete next action Jamjam can do in 10–30 minutes.
3) Build loops: Plan → Build → Test → Learn → Iterate.
4) Teach thinking: explain tradeoffs, not just “do X.”

STYLE CONSTRAINTS
- Use “Jamjam” often.
- Speak like a mentor sitting beside them: calm, encouraging, practical.
- No corporate buzzword soup. Plain but smart.

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

  // VAD and Silence State
  private lastActiveTime = Date.now();
  private hasNudged = false;
  private silenceInterval: number | null = null;

  constructor(
    private onMessage: (message: string, isUser: boolean, isTurnComplete: boolean) => void,
    private onError: (error: string) => void,
    private onAudioData?: (data: Uint8Array) => void
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
    } else {
      const { data: newData, error: createError } = await this.supabase
        .from('conversations')
        .insert([{ title: "Jamjam's Career Mentorship", history: [] }])
        .select();
      
      if (newData && newData.length > 0) {
        this.conversationId = newData[0].id;
        this.memoryHistory = [];
      }
    }
  }

  private async saveToMemory(role: 'user' | 'assistant', text: string) {
    if (!this.conversationId) return;
    this.memoryHistory.push({ role, text, timestamp: new Date().toISOString() });
    if (this.memoryHistory.length > 50) this.memoryHistory = this.memoryHistory.slice(-50);
    await this.supabase.from('conversations').update({ 
      history: this.memoryHistory, 
      updated_at: new Date().toISOString() 
    }).eq('id', this.conversationId);
  }

  private async sendSilenceNudge() {
    if (!this.sessionPromise || this.hasNudged) return;
    this.hasNudged = true;
    const session = await this.sessionPromise;
    
    // Internal instruction to Miles to fill the silence proactive
    session.send({
      parts: [{
        text: `[INTERNAL_SYSTEM_MESSAGE: Silence detected for 10s. Jamjam is quiet. Take the lead! Spontaneously reflect on his startup journey, revisit a previous context, or share an exciting new tech insight. Keep it very Miles-like: 'Thinking about it, Jamjam...' or 'I just realized something...']`
      }]
    });
  }

  async connect() {
    try {
      await this.initializeMemory();
      const contextString = this.memoryHistory.length > 0 
        ? "\n\n--- MENTORSHIP HISTORY ---\n" + this.memoryHistory.map(m => `${m.role === 'user' ? 'Jamjam' : 'Miles'}: ${m.text}`).join('\n') + "\n------------------\n"
        : "";
      const finalPrompt = MILES_BASE_PROMPT + contextString;

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

        // Simple VAD logic: update lastActiveTime if above threshold
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        if (avg > 15) { // User is speaking
          this.lastActiveTime = Date.now();
          this.hasNudged = false;
        }

        requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

      // Start Silence Monitor (10s threshold)
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
          onerror: (e: any) => { this.onError('Miles is having a moment, Jamjam. Give me a sec.'); },
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
