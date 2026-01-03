
# App Overview: Miles - Startup Mentor AI

Miles is a specialized voice-first assistant designed for "Jamjam," a teen interested in software development startups. Created by "Master E," Miles provides practical coaching using a "warm, curious, and supportive" tone.

## Features
- **Adaptive Learning Profile**: Miles observes and mirrors Jamjam's learning style. He tracks preferences for technical depth, pace, and interests, persisting this "mental model" in Supabase.
- **Proactive Silence Handling (VAD)**: If Jamjam is quiet for 10s, Miles uses his updated Learner Profile to bring back relevant context or share a new insight that fits Jamjam's interests.
- **Action Control Bar**: A sleek, iOS-inspired footer bar that allows toggling Camera, Screen Share, and active conversation states.
- **Master E Context**: Miles recognizes Master E as his world-class engineer creator.
- **Ultra-Human Personality (Hifi Spec)**: 
  * **Cadence**: Moderate-fast words (~180 WPM) but unhurried overall (~110 WPM) due to spacious timing.
  * **Timing**: Precise micro-pauses (250ms/800ms/1.2s) for clarity and thoughtfulness.
  * **Intonation**: Dynamic pitch range (94-225Hz) with specific "pitch lifts" to signal curiosity and excitement.
  * **Behavior**: Uses the "Mentor Loop" (Reflect -> Clarify -> 3-Step Plan -> Tiny Task).
- **Native Multi-Lingual Adaptation**: Detects and responds natively in any language.
- **Long-term Memory**: Persists conversation history and learner metadata in Supabase.
- **Immersive Visualizer**: Organic breathing orb that reacts to speech frequency and can overlay video feeds.

## Implementation Status
- [x] Base Audio Streaming (Input/Output)
- [x] Adaptive Learning Profile (Preference persistence)
- [x] Proactive Silence Nudge (Smarter 10s context)
- [x] Persona Consistency (Breathy/Sesame Hifi Spec)
- [x] Native Multi-Lingual Adaptation
- [x] Long-term Memory (Supabase integration)
- [x] Responsive Mobile-First UI (Enhanced Action Bar)
- [x] Camera & Screen Share UI Controls
