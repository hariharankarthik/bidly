/**
 * Optional MP3s under /public/sounds/ — if missing, calls no-op.
 * See public/sounds/README.txt for filenames.
 */
const cache = new Map<string, HTMLAudioElement>();

export const SOUND_PATHS = {
  bid: "/sounds/bid.mp3",
  sold: "/sounds/sold.mp3",
  gavel: "/sounds/gavel.mp3",
  timerWarning: "/sounds/timer-warning.mp3",
} as const;

export type SoundKey = keyof typeof SOUND_PATHS;

export function playSound(key: SoundKey, volume = 0.45): void {
  if (typeof window === "undefined") return;
  try {
    const src = SOUND_PATHS[key];
    let audio = cache.get(src);
    if (!audio) {
      audio = new Audio(src);
      cache.set(src, audio);
    }
    audio.volume = volume;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* Missing file or autoplay policy */
    });
  } catch {
    /* ignore */
  }
}
