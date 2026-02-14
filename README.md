# FreeTeleprompter

A free browser-based teleprompter for phones, tablets, and computers.

## Views

- **Operator view** (default `/`): script editing, transport controls, styling, Google Doc refresh, and display tools.
- **Prompter view** (`/?view=prompter`): clean full-screen talent-facing feed with optional mirror.
- **Phone remote** (`/?view=remote`): touch-friendly transport and speed controls.
  - To keep phone and operator script/settings in sync, open the remote from the operator's **Open Phone Remote** button so the current state is embedded in the link.

## Feature highlights

- Independent mirror toggles for operator and prompter output.
- Full-screen clean feed mode.
- Typography controls: font, size, line spacing, paragraph spacing.
- Contrast controls: background, text color, optional shadow.
- Framing controls: side margins and reading guide position/size/mode.
- Smooth time-based scrolling with speed nudges and keyboard shortcuts.
- Jump controls: back lines and marker navigation (`# Heading` or `[MARKER]`).
- Countdown lead-in and autosaved per-script settings.
- Prompter output can be opened in a separate window for HDMI/tablet display rigs.
- Google Doc linking with one-click refresh via doc export endpoint.
- Wake Lock toggle for long reads and minimal accidental touch scrolling.

## Run locally

Use the bundled Python server so operator/remote stay synced across devices via the built-in sync relay endpoint.

```bash
python3 server.py
```

Open `http://localhost:4173`.

> If you use a plain static server (like `python -m http.server`), cross-device syncing will not work because there is no sync relay endpoint.
