// Music corner config. Add royalty-free audio files to /public/audio/ (or use
// hosted URLs) and fill in the `src` values below — see README "Wellness music".
// Empty src = track shows as "coming soon" in the player.

export interface MusicTrack {
  title: string;
  src: string; // e.g. "/audio/lofi-1.mp3" or a hosted royalty-free URL
}

export type MusicCategory = "lo-fi" | "rain" | "nature" | "focus";

export const MUSIC_LIBRARY: Record<MusicCategory, MusicTrack[]> = {
  "lo-fi": [
    { title: "Slow tape", src: "" },
    { title: "Night study", src: "" },
  ],
  rain: [
    { title: "Soft rain on window", src: "" },
    { title: "Distant thunder", src: "" },
  ],
  nature: [
    { title: "Forest morning", src: "" },
    { title: "River flow", src: "" },
  ],
  focus: [
    { title: "Deep focus drone", src: "" },
    { title: "Airy pads", src: "" },
  ],
};
