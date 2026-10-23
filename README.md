# Creative Portfolio — Motion Lab (EXPERIMENT COPY)

This repository is a **copy** of `Creative-Portfolio-Website` used only for
motion/design experiments inspired by MotionSites. The original website and
its live deployment are **not touched** by anything in this repo.

How it works:

- All site code (HTML/CSS/JS) is cloned from the original.
- Binary assets (the 193 hero film frames, `hero.webp`, `og.jpg`) are **not**
  duplicated here. In this lab copy they load from the original site's public
  URLs, so the film is pixel-identical and the originals stay untouched.
- Lab-only additions live in `lab.css` / `lab.js`: scroll progress hairline,
  soft hero ambience, section reveals, giant-type footer band.
- `main.js` differs from the original only by the `ASSET_BASE` constant that
  points frame loading at the original site.

If an experiment is approved, it gets ported into the original repository
(where the frames already live) in small, verified steps.
