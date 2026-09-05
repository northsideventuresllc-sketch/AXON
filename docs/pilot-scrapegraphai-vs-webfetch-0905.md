# Pilot: ScrapeGraphAI vs WebFetch (AXON-SCRAPEGRAPHAI-PILOT-0817)

Ponder run 8 finding, closed out 2026-09-05.

## Setup

Same URL, same prompt, both engines:

- URL: `https://en.wikipedia.org/wiki/Web_scraping`
- Prompt: "List the main sections of this page as a JSON array of section titles."
- ScrapeGraphAI: `SmartScraperGraph`, backed by the local Ollama `axon-llama` model
  (`http://localhost:11434`), headless Chromium fetch (`scripts/scrapegraphai-pilot-0905.py`)
- WebFetch: Claude Code's built-in WebFetch tool (HTML→markdown, small fast model extraction)

## Result

| | ScrapeGraphAI | WebFetch |
|---|---|---|
| Elapsed | 93.32s | ~6.6s |
| Output | `["Main menu","Navigation","Contribute","Search","Appearance","Personal tools","Contents","History","Techniques","Legal issues","Methods to prevent web scraping","See also","References"]` | `["History","Techniques","Legal issues","Methods to prevent web scraping","See also","References"]` |

WebFetch was ~14x faster and more accurate: it correctly returned only the article's
actual content sections. ScrapeGraphAI's headless-Chromium-rendered DOM handed the local
3B `axon-llama` model raw page structure and it could not distinguish nav/UI chrome
("Main menu", "Navigation", "Contribute", "Search", "Appearance", "Personal tools",
"Contents") from real article sections — it listed both as "sections."

## Adopt/drop call

**Drop.** For GROUND-phase research fetches, WebFetch is faster and more accurate on
this task with zero extra infrastructure (no Playwright browser download, no local model
serving). ScrapeGraphAI only becomes worth revisiting if a future task needs structured
multi-page crawl graphs (its actual differentiator) rather than single-page extraction,
and even then it would need a stronger backing model than a local 3B quant to beat
WebFetch's accuracy on chrome-vs-content filtering.

## Repro

```
python3 -m venv .venv-pilot && source .venv-pilot/bin/activate
pip install scrapegraphai && playwright install chromium
python3 scripts/scrapegraphai-pilot-0905.py
```
