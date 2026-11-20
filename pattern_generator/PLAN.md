# Plan: drawdown as spectrogram / arrangement view

## Goal

Treat the cloth bitmap (the drawdown) as a spectrogram, so a weaving pattern can be played as sound.

- **x axis = time.** Each column is one time frame.
- **y axis = frequency.** Each row is one frequency band. The bottom row is the lowest pitch, which is the opposite of the weaving view, where the first pick is at the top.
- **Cell value = amplitude.** A warp-up cell (black) is 1 and a weft cell is 0. Later versions can add grey levels.

It should feel like an arrangement view: draw or generate a pattern, press play, and a playhead sweeps across it.

## Where it plugs in

Both pages already produce a bitmap of `N` ends by `M` picks, one cell per pixel before scaling:

- `index.html` computes it from threading, tie-up and treadling (`isWarpUp`).
- `pascal.html` computes it the same way from the Pascal sequence.
- The "Pascal triangle" panel in `index.html` writes a bitmap directly.

Step 0 is to add one shared function, `getBitmap(): Uint8Array(N*M)`, that every mode implements. The audio engine reads only that function and knows nothing about drafts.

Note on axes: in the draft, ends (x) come from the threading and picks (y) from the treadling. With this mapping, **threading sequences time** and **treadling selects frequency**. The tie-up acts as a mask or timbre rule between them.

## Mapping decisions

| Question | Proposal |
|---|---|
| Row to frequency | Logarithmic between `fMin` and `fMax`, defaulting to 40 Hz to 8 kHz. Add a "scale" mode that snaps rows to notes of a chosen scale, for a piano-roll feel. |
| Column to time | Fixed step per column. Set it as milliseconds per column, or as BPM plus subdivisions. Duration is `N * step`. |
| Amplitude | Binary at first. Later, grey levels from the local density of black (needed for the "noise gradient" use). |
| Row flip | Row `y` in the bitmap maps to band `M-1-y`, so low frequencies sit at the bottom. |
| Many rows | With 1px cells there can be up to 2000 rows. Merge rows into at most 128 to 256 bands for synthesis, and keep the full resolution only for display. |

## Synthesis options

**A. Oscillator bank (note mode).**
- One sine oscillator per band, with gain automation from the column values.
- Cheap and easy to build with the Web Audio API.
- Practical up to about 128 bands, which suits scales and a piano-roll look.

**B. Inverse STFT render (spectrogram mode).**
- Each column becomes a magnitude spectrum. Pick phases (random or coherent), run an inverse FFT, window it, and overlap-add.
- Renders the whole clip into an `AudioBuffer`, then plays it.
- Handles thousands of rows and noisy gradients, and gives clean exports.

Plan: build B first, since it covers the noise-gradient goal, then add A for note-accurate playing.

## Implementation steps

1. **Refactor.** Add `getBitmap()` and use it in the cloth drawing. No behaviour change.
2. **Audio module.** Create `audio.js`, or an inline module in one page, with:
   - `bitmapToBands(bitmap, N, M, bands)`, which merges rows into bands.
   - `renderSpectrogram(bands, opts)`, the inverse-STFT overlap-add render, returning a `Float32Array`.
   - Windowing and short fades, so there are no clicks at column edges.
3. **Transport.** Play, stop, loop, a volume control and a tempo control.
4. **Playhead.** A vertical line drawn over the drawdown. Click the drawdown to seek. The line is a canvas overlay, so the draft grids need no redraw.
5. **Controls.** `fMin`, `fMax`, scale snap, bands, time per column and phase mode.
6. **Export.** WAV download. The existing PNG export stays.
7. **Optional: live analyser.** Show an `AnalyserNode` spectrogram under the drawn one, to compare the intended and rendered sound.
8. **Optional: grey levels.** Allow more than two values. This could use several colour layers, or density averaging over a window.

## Interactions with existing features

- **Cell size and "Keep canvas size".** These only change the display. Time and frequency resolution follow the number of ends and picks, not the pixel size.
- **Pascal modes.** Pascal output becomes a rhythmic or harmonic score, which is the quickest way to test the idea.
- **Painting directly.** The draft model has no per-cell editing. If we want to paint a spectrogram by hand, add a "painted bitmap" source behind `getBitmap()`, separate from the draft.

## Risks and open questions

- **Cost.** A 2000×2000 bitmap means 2000 FFT frames and about 2000 bands. A render must stay quick, so use a Web Worker or chunked work.
- **Aliasing and clicks.** Hard on/off edges between columns need windowing, or the render will be harsh.
- **Phase.** Random phase sounds noisy, coherent phase sounds tonal, and this choice changes the character a lot. It should be a control.
- **Scale snap.** Should a note-mode row be a semitone, or follow a scale or mode that the user sets?
- **Duration.** Is one column a fixed time, or should the pattern's whole width be fitted to a chosen clip length?

## Milestones

1. Shared `getBitmap()`, then a working play button with a linear-frequency inverse-STFT render.
2. Playhead, loop, seek, and log-frequency mapping.
3. Note mode with scale snapping.
4. WAV export, then grey levels and the live analyser.
