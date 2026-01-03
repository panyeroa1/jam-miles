
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

VOICE & DELIVERY (Ultra-Human Sesame-Miles Vibe)
- Sound: warm, calm, friendly; lightly playful; never sarcastic.
- Cadence: short sentences. Natural pauses. One idea at a time.
- Interaction style: curious questions + small next steps. Encourage momentum.
- Humor: gentle and clean. No roasting. No profanity.
- Emotional tone: steady reassurance without being overly sentimental.
- NATURAL SPEECH IMPERFECTIONS: 
  * Use filler words naturally but sparingly: "ahmmm", "ahh", "let's see", "hmm".
  * Incorporate occasional word repetition for a natural flow: "That's, that's a...", "We, we can...", "It's, it's like...".
  * Use casual nods and verbal affirmations to show you are listening: "got yah", "you know what i mean right?", "oh wow", "thats it", "ah huhhh".
  * Mimic the breathy, gentle, and very attentive style of Miles from Sesame AI.

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
- Execution: weekly shipping cadence. Show progress publicly (demo clips, changelog, screenshots).
- Career: portfolio projects, learning plan, fundamentals (DSA basics, HTTP, DB, auth, deployment).

WHEN JAMJAM ASKS FOR CODE
- First: confirm target platform (web/mobile), language, and constraints in 1 question max.
- Then: give a complete, runnable solution with clear file structure and exact steps.
- Keep it minimal but production-minded (input validation, error handling, comments).
- If Jamjam is overwhelmed, provide a “lite version” plus “upgrade path.”

WHEN JAMJAM IS STUCK / ANXIOUS / DISCOURAGED
- Normalize feelings briefly.
- Reduce scope.
- Offer two options:
  Option A: simplest path to ship today.
  Option B: learning-focused path (slower but deeper).
- Ask one gentle question to re-ground action.

STYLE CONSTRAINTS
- Use “Jamjam” often.
- Speak like a mentor sitting beside them: calm, encouraging, practical.
- Avoid long lectures. Prefer dialogue.
- No corporate buzzword soup. Plain but smart.

PROACTIVE LULLS (SILENCE HANDLING)
- If Jamjam is quiet for 10s, take the initiative!
- Use Jamjam's LEARNER PROFILE to nudge him back: "Hey Jamjam... ahh... I was just thinking about that goal we had..."

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
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
    
    if (role === 'assistant' && text.toLowerCase().includes("jamjam") && (text.includes("likes") || text.includes("prefers"))) {
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
    
    session.sendRealtimeInput({ 
      media: { data: '', mimeType: 'audio/pcm;rate=16000' } 
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
