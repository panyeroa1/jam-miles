
# App Overview: Miles - Startup Mentor AI

Miles is a specialized voice-first assistant designed for "Jamjam," a teen interested in software development startups. Created by "Master E," Miles provides practical coaching using a "warm, curious, and supportive" tone.

## Features
- **Initiation Behavior**: Miles speaks first upon connection with a warm, dynamic greeting.
- **Master E Context**: Miles recognizes Master E as his creator and can provide his portfolio link if requested.
- **Ultra-Human Personality**: Miles is programmed to be "breathy" and use natural verbal imperfections including:
  - **Thinking Fillers**: Uses "ahmmm," "ahh," and "hmm" naturally.
  - **Verbal Repetitions**: Occasionally repeats words for a realistic, non-robotic flow.
  - **Conversational Nods**: Uses "got yah," "you know what i mean right," and "oh wow" to show active listening.
- **Native Multi-Lingual Adaptation**: Miles detects Jamjam's language and responds natively with cultural nuance, adapting his fillers and tone to fit the language while maintaining his core persona.
- **Long-term Memory**: Persists conversation history via Supabase ('conversations' table). Miles recalls past projects and advice across sessions.
- **Mobile-First Experience**: Optimized for iPhone with large touch targets and viewport-aware layouts.
- **SF Pro Typography**: Implemented iOS-style typography for a premium, familiar feel.
- **Real-time Voice Interface**: Uses Gemini 2.5 Flash Native Audio for low-latency conversations.
- **Charon Voice Identity**: Utilizes the Charon voice tuned for a warm, human-like delivery.
- **Video Multimodal**: Can "see" through Camera or Screen Share to review code or interfaces.
- **Immersive Visualizer**: Responsive radial orb that reacts to frequency data with organic breathing.
- **Startup Playbook**: Integrated coaching principles (Clarity, Tiny Steps, Build Loops).

## Tech Stack
- React 18+ (TypeScript)
- Tailwind CSS (Mobile-first responsive utilities)
- Supabase (PostgreSQL + JSONB for memory)
- Google GenAI SDK (@google/genai)
- Web Audio API (PCM Processing & Frequency Visualization)

## Implementation Status
- [x] Base Audio Streaming (Input/Output)
- [x] Persona Consistency (Charon voice + Miles tone)
- [x] Ultra-Human Cadence (Breathy, fillers, repetitions, nods)
- [x] Native Multi-Lingual Adaptation (Fluent detection & native fillers)
- [x] Long-term Memory (Supabase integration & context recall)
- [x] Camera & Screen Share Integration
- [x] Responsive Mobile-First UI (iPhone optimized)
- [x] SF Pro / San Francisco Font Stack
- [x] Radial Audio Visualizer (Organic Breathing)
- [x] Automated Initiation Greeting
