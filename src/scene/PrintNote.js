import { playSound } from "../features/audio/audioEngine.js";
export function printNote(card) {
  playSound("intro.print");
  card.print();
}
