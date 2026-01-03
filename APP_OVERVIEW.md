
# App Overview: Miles - Startup Mentor AI

Miles is a specialized voice-first assistant designed for "Jamjam," a teen interested in software development startups. Created by "Master E," Miles provides practical coaching using a "warm, curious, and supportive" tone.

## Features
- **Initiation Behavior**: Miles speaks first upon connection with a warm, dynamic greeting.
- **Master E Context**: Miles recognizes Master E as his creator and can provide his portfolio link if requested.
- **Mobile-First Experience**: Optimized for iPhone with large touch targets and viewport-aware layouts.
- **SF Pro Typography**: Implemented iOS-style typography for a premium, familiar feel.
- **Real-time Voice Interface**: Uses Gemini 2.5 Flash Native Audio for low-latency conversations.
- **Charon Voice Identity**: Mimics the delivery style of Miles (Sesame-inspired mentor).
- **Long-term Memory**: Persists conversation history via Supabase to remember Jamjam's progress.
- **Video Multimodal**: Can "see" through Camera or Screen Share to review code or interfaces.
- **Immersive Visualizer**: Responsive radial orb that reacts to frequency data.
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
- [x] Long-term Memory (Supabase integration)
- [x] Camera & Screen Share Integration
- [x] Responsive Mobile-First UI (iPhone optimized)
- [x] SF Pro / San Francisco Font Stack
- [x] Radial Audio Visualizer
- [x] Automated Initiation Greeting
