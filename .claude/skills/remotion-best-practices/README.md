# remotion-best-practices (vendored, trimmed)

Remotion's official agent skill, used to build the demo video in `video/`.

Installed from the repo root with:

```bash
npx -y skills@1.7.1 add remotion-dev/skills --agent claude-code --skill remotion-best-practices --copy -y
```

`skills-lock.json` at the repo root records that install.

**Trimmed.** Only the parts this project uses are kept:

- `SKILL.md`, the router
- `remotion-markup/`: `REFERENCE.md`, `compositions.md`, `sequencing.md`, `timing.md`, `timing-props.md`, `multi-scene-video.md`, `google-fonts.md`, `embedding-videos.md`, `ffmpeg.md`
- `remotion-render/REFERENCE.md`
- `remotion-studio/REFERENCE.md`

The installer copied 141 files. The rest (maps, captions, saas, multimedia, create, docs, upgrade, interactivity, the other markup topics, and the agent metadata and icons) was removed. Links that pointed at removed files now point at the same file upstream, under
`https://github.com/remotion-dev/skills/blob/main/skills/remotion-best-practices/`.
Upstream content may change.

**To restore the full set**, re-run the command above. It reinstalls the complete skill into this folder. This README may be overwritten or left behind.
