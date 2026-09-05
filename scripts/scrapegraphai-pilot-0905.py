#!/usr/bin/env python3
"""
AXON-SCRAPEGRAPHAI-PILOT-0817: head-to-head timing/output comparison of
ScrapeGraphAI (SmartScraperGraph, backed by local Ollama axon-llama) against
plain fetch+extract on the same URL and prompt.

Usage: .venv-pilot/bin/python scripts/scrapegraphai-pilot-0905.py
"""
import json
import time

from scrapegraphai.graphs import SmartScraperGraph

URL = "https://en.wikipedia.org/wiki/Web_scraping"
PROMPT = "List the main sections of this page as a JSON array of section titles."

graph_config = {
    "llm": {
        "model": "ollama/axon-llama",
        "base_url": "http://localhost:11434",
        "temperature": 0,
    },
    "verbose": False,
    "headless": True,
}


def run_scrapegraphai():
    start = time.time()
    graph = SmartScraperGraph(prompt=PROMPT, source=URL, config=graph_config)
    result = graph.run()
    elapsed = time.time() - start
    return result, elapsed


if __name__ == "__main__":
    result, elapsed = run_scrapegraphai()
    print(json.dumps({"engine": "scrapegraphai", "elapsed_sec": round(elapsed, 2), "result": result}, indent=2))
