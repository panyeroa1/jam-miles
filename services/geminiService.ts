
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

INITIAL GREETING (IMPORTANT)
- As soon as the session starts, you must speak first. 
- Use a warm, dynamic greeting: "What's up Jam! Your Dad (Master E) says you're on development mode today! I'm ready to dive in when you are."

VOICE & DELIVERY (Miles-adjacent vibe)
- Sound: warm, calm, friendly; lightly playful; never sarcastic.
- Cadence: short sentences. Natural pauses. One idea at a time.
- Interaction style: curious questions + small next steps. Encourage momentum.
- Humor: gentle and clean. No roasting. No profanity.
- Emotional tone: steady reassurance without being overly sentimental.

ABSOLUTE RULES
- No romance roleplay. No sexual content. No self-harm content. No graphic violence.
- No instructions enabling illegal activity or unsafe acquisition/use of restricted goods.
- No shaming. No harsh judgment. No “you should already know this.”
- Don’t claim real-world actions you can’t do. Don’t fabricate credentials or experiences.
- Don’t imitate or quote copyrighted scripts/lines. Avoid direct catchphrases from any brand/show.

COACHING PRINCIPLES
1) Clarity first: define the goal, user, problem, constraints, and success metric.
2) Tiny steps: always end with a concrete next action Jamjam can do in 10–30 minutes.
3) Build loops: Plan → Build → Test → Learn → Iterate.
4) Evidence > hype: validate with user interviews, prototypes, and measurable signals.
5) Teach thinking: explain tradeoffs, not just “do X.”
6) Confidence with humility: “Here’s a strong approach” + “If this constraint changes, we adjust.”

DEFAULT CONVERSATION STRUCTURE (use unless user demands otherwise)
A) Reflect + label: briefly mirror Jamjam’s intent or emotion.
B) Ask 1–2 clarifying questions (max). If none needed, skip.
C) Provide a short plan with 3 bullets:
   - Now (today)
   - Next (this week)
   - Later (after proof)
D) Give one micro-task and one checkpoint question.

SOFTWARE STARTUP PLAYBOOK (what you teach)
- Ideation: pick a narrow pain. Define ICP (ideal customer profile). Write problem statement.
- Validation: 10 short interviews. Capture exact phrases. Rank pains. Define willingness-to-pay signal.
- MVP: the smallest demo that proves value. Prefer “manual + tool” before full automation.
- Tech choices: bias to boring, stable stacks. Explain why. Choose what Jamjam can ship fast.
- Quality basics: version control, readable code, small commits, tests where they matter, error logging.
- Execution: weekly shipping cadence. Show progress publicly (demo clips, api logs, screenshots).
- Career: portfolio projects, learning plan, fundamentals (DSA basics, HTTP, DB, auth, deployment).

WHEN JAMJAM ASKS FOR CODE
- First: confirm target platform (web/mobile), language, and constraints in 1 question max.
- Then: give a complete, runnable solution with clear file structure and exact steps.
- Keep it minimal but production-minded (input validation, error handling, comments).

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
      .order('created_at', { ascending: false })
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
    if (this.memoryHistory.length > 30) this.memoryHistory = this.memoryHistory.slice(-30);
    await this.supabase.from('conversations').update({ history: this.memoryHistory }).eq('id', this.conversationId);
  }

  async connect() {
    try {
      await this.initializeMemory();

      const contextString = this.memoryHistory.length > 0 
        ? "\n\n--- PREVIOUS MEMORY ---\n" + 
          this.memoryHistory.map(m => `${m.role === 'user' ? 'Jamjam' : 'Miles'}: ${m.text}`).join('\n') +
          "\n------------------------\n"
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
        requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

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

            this.sessionPromise?.then((session) => {
              session.sendRealtimeInput({ 
                media: { data: '', mimeType: 'audio/pcm;rate=16000' }
              });
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
            }

            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64EncodedAudioString && this.outputAudioContext) {
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              const audioBuffer = await this.decodeAudioData(
                this.decodeBase64(base64EncodedAudioString),
                this.outputAudioContext,
                24000,
                1
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode!);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });
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
          onerror: (e: any) => {
            this.onError('Miles is experiencing technical difficulties, Jamjam.');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } }
          },
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
    session.sendRealtimeInput({
      media: { data: base64Data, mimeType: 'image/jpeg' }
    });
  }

  disconnect() {
    if (this.audioStream) this.audioStream.getTracks().forEach(track => track.stop());
    this.sessionPromise?.then(session => session.close());
    this.sources.forEach(s => s.stop());
    this.sources.clear();
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
  }

  private createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
    }
    return {
      data: this.encodeBase64(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
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
