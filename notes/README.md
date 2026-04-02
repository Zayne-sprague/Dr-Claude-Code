# Notes

This folder stores experiment tracking data and your personal notes.

## `experiments/`

Each experiment gets its own folder here (`notes/experiments/<name>/`). RACA creates and manages these — they contain the experiment config, README, activity timeline, red-team brief, HuggingFace repo links, and your personal notes in `user/`. The dashboard reads from this folder to display your experiments.

## Personal notes

You can also use this folder for anything else — ideas, reading notes, literature reviews, brainstorming. For example:

- `notes/ideas/` — rough ideas and hypotheses you're thinking about
- `notes/lit-reviews/` — paper summaries and reading notes
- `notes/meetings/` — meeting notes

RACA reads files in this folder, so the more context you put here, the better it understands your research. If you use a note-taking app like Obsidian, you can symlink your vault here (e.g., `ln -s ~/obsidian-vault notes/obsidian`) and RACA will be able to read and reference your notes.
