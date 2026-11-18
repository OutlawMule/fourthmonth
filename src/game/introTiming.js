// Timing of the "BLAQ STUDIOS: PIXELS & PEONIES" opening, in seconds. Kept free of Phaser
// and the DOM so the unit tests can check that the button appears inside the 6-10 s window.
export const INTRO_T = Object.freeze({
  scan0: 0.45,        // scene 1: a violet scan line sweeps down the dark screen
  scan1: 1.45,
  logoIn: 1.2,        // scene 2: BLAQ STUDIOS flickers in, glitches, stabilises
  fracture: 3.25,     // scene 3: the logo breaks into pixels
  stream: 3.65,       //          ...which spiral into two streams
  asm: 4.55,          // scene 4: the pixels build the flowers, petal by petal
  asmSpan: 1.65,
  flight: 0.7,
  fireflies: 5.6,
  drift: 6.75,        // scene 5: the flowers drift to opposite sides
  driftLen: 1.5,
  title: 7.2,         //          "PIXELS & PEONIES" + the italic line, music shift
  enter: 8.5,         // scene 6: the ENTER THE WORLD button appears
});

// After the player presses ENTER THE WORLD (seconds since the press).
export const INTRO_EXIT = Object.freeze({
  release: 0.9,       // flowers dissolve into pixel trails
  tunnel: 0.35,       // the purple digital tunnel fades in
  city: 1.15,         // the tunnel opens onto a neon city
  cityLen: 0.95,
  fade: 1.95,         // fade to the menu colour
  end: 2.4,
});

/** Seconds a first-time player waits before the button shows up. */
export const INTRO_SECONDS_BEFORE_ENTER = INTRO_T.enter;
