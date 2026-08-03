---
name: gemini-video
description: Ask Gemini about a video — summarize, transcribe, answer questions, or extract timestamps from a YouTube URL or local file.
---

Run the script, passing the video source and what to do with it:

```bash
node scripts/gemini-video.mjs "<source>" "<prompt>" [model]
```

- `source` — a public YouTube URL (passed straight through to Gemini) or a local video file path (inlined if under 15MB, otherwise uploaded via the File API and polled until it finishes processing).
- `prompt` — what to do with the video, e.g. `"summarize with timestamps"`.
- `model` — optional, defaults to `gemini-2.5-flash`.

Requires `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in the environment. Prints the extracted text to stdout.
