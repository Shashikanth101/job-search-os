# Verified ATS batch validation

75 configured scrapers; 66 added entries remain active; Greenhouse Perplexity was removed after repeated HTTP 404 responses. The Ashby Perplexity scraper remains active.

1284 new jobs from the 66 added active scrapers; 1328 from all requested entries including existing Postman, CRED, and Meesho.
39 → 1435 persisted jobs in the completed scrape.

9564 postings from added sources: 3328 rejected by title, 4952 by location, 1284 accepted for ranking. All 86 Zscaler Account Executive postings were rejected. Three transient ranking failures succeeded on retry.

New-row counts compare final persisted rows with the pre-session database snapshot. Saved counts are writes from the final run, including updates. Ambiguous titles use the existing per-job LLM ranker. Location eligibility uses raw ATS metadata; the LLM can return null for multi-country postings. The accepted pre-filter ADRs were not previously implemented; this batch adds the code gate to the four ATS parsers. Greenhouse Perplexity was removed from the active registry after repeated HTTP 404 responses; only the working Ashby slug perplexity remains configured.

| Company | Source | Added entry | Fetched | Title rejected | Location rejected | Accepted | Saved/updated | New rows |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Swiggy | swiggy-careers |  | — | — | — | — | 0 | 0 |
| Postman | greenhouse-postman |  | 64 | 26 | 29 | 9 | 9 | 8 |
| Razorpay | greenhouse-razorpaysoftwareprivatelimited |  | 22 | 7 | 3 | 12 | 12 | 12 |
| Groww | greenhouse-groww |  | 7 | 0 | 0 | 7 | 7 | 7 |
| Glean | greenhouse-gleanwork |  | 118 | 57 | 45 | 16 | 16 | 12 |
| HackerRank | greenhouse-hackerrank | Yes | 29 | 11 | 5 | 13 | 13 | 13 |
| Cognite | greenhouse-cognite | Yes | 48 | 20 | 14 | 14 | 14 | 14 |
| Komodo Health | greenhouse-komodohealth | Yes | 30 | 8 | 14 | 8 | 8 | 8 |
| Druva | greenhouse-druva | Yes | 41 | 18 | 10 | 13 | 13 | 13 |
| Zscaler | greenhouse-zscaler | Yes | 371 | 220 | 100 | 51 | 51 | 51 |
| New Relic | greenhouse-newrelic | Yes | 54 | 22 | 22 | 10 | 10 | 10 |
| Rubrik | greenhouse-rubrik | Yes | 141 | 69 | 39 | 33 | 33 | 33 |
| Amplitude | greenhouse-amplitude | Yes | 38 | 19 | 18 | 1 | 1 | 1 |
| LaunchDarkly | greenhouse-launchdarkly | Yes | 54 | 24 | 26 | 4 | 4 | 4 |
| Observe.AI | greenhouse-observeai | Yes | 17 | 8 | 4 | 5 | 5 | 5 |
| ZoomInfo | greenhouse-zoominfo | Yes | 109 | 32 | 64 | 13 | 13 | 13 |
| Databricks | greenhouse-databricks | Yes | 891 | 280 | 473 | 138 | 138 | 138 |
| Elastic | greenhouse-elastic | Yes | 357 | 155 | 182 | 20 | 20 | 20 |
| Canonical | greenhouse-canonical | Yes | 303 | 92 | 205 | 6 | 6 | 6 |
| Moniepoint Group | greenhouse-moniepoint | Yes | 208 | 61 | 124 | 23 | 23 | 23 |
| YipitData | greenhouse-yipitdata | Yes | 52 | 18 | 27 | 7 | 7 | 7 |
| EarnIn | greenhouse-earnin | Yes | 22 | 4 | 13 | 5 | 5 | 5 |
| Coinbase | greenhouse-coinbase | Yes | 218 | 64 | 132 | 22 | 22 | 22 |
| Blink Health | greenhouse-blinkhealth | Yes | 75 | 13 | 54 | 8 | 8 | 8 |
| Instawork | greenhouse-instawork | Yes | 54 | 18 | 13 | 23 | 23 | 23 |
| Airbnb | greenhouse-airbnb | Yes | 164 | 20 | 131 | 13 | 13 | 13 |
| GitLab | greenhouse-gitlab | Yes | 228 | 120 | 63 | 45 | 45 | 45 |
| Anthropic | greenhouse-anthropic | Yes | 596 | 212 | 344 | 40 | 40 | 40 |
| xAI | greenhouse-xai | Yes | 254 | 48 | 201 | 5 | 5 | 5 |
| Inflection AI | greenhouse-inflectionai | Yes | 6 | 1 | 5 | 0 | 0 | 0 |
| Stability AI | greenhouse-stabilityai | Yes | 7 | 1 | 6 | 0 | 0 | 0 |
| HeyGen | greenhouse-heygen | Yes | 17 | 10 | 6 | 1 | 1 | 1 |
| Scale AI | greenhouse-scaleai | Yes | 223 | 46 | 145 | 32 | 32 | 32 |
| CoreWeave | greenhouse-coreweave | Yes | 295 | 85 | 205 | 5 | 5 | 5 |
| PhonePe | smartrecruiters-PHONEPELIMITED |  | 57 | 19 | 0 | 38 | 38 | 37 |
| Zomato | smartrecruiters-Zomato1 |  | 3 | 1 | 2 | 0 | 0 | 0 |
| Freshworks | smartrecruiters-freshworks | Yes | 139 | 55 | 46 | 38 | 38 | 38 |
| Swiggy | smartrecruiters-swiggy | Yes | 71 | 49 | 1 | 21 | 21 | 21 |
| ServiceNow | smartrecruiters-servicenow | Yes | 629 | 239 | 321 | 69 | 69 | 69 |
| Refyne | smartrecruiters-refyne | Yes | 10 | 5 | 0 | 5 | 5 | 5 |
| Upstox | smartrecruiters-upstox | Yes | 1 | 0 | 0 | 1 | 1 | 1 |
| CRED | lever-cred |  | 11 | 2 | 1 | 8 | 8 | 8 |
| Meesho | lever-meesho |  | 50 | 21 | 0 | 29 | 29 | 28 |
| Acceldata | lever-acceldata | Yes | 46 | 19 | 12 | 15 | 15 | 15 |
| Palantir Technologies | lever-palantir | Yes | 311 | 99 | 178 | 34 | 34 | 34 |
| Paytm | lever-paytm | Yes | 210 | 61 | 20 | 129 | 129 | 129 |
| Spotify | lever-spotify | Yes | 72 | 17 | 35 | 20 | 20 | 20 |
| UiPath | ashby-uipath | Yes | 109 | 53 | 46 | 10 | 10 | 10 |
| Tekion | ashby-tekion | Yes | 110 | 20 | 17 | 73 | 73 | 73 |
| Harvey | ashby-harvey | Yes | 325 | 183 | 135 | 7 | 7 | 7 |
| Temporal | ashby-temporal | Yes | 70 | 23 | 43 | 4 | 4 | 4 |
| Confluent | ashby-confluent | Yes | 21 | 5 | 16 | 0 | 0 | 0 |
| SpotDraft | ashby-spotdraft | Yes | 13 | 7 | 0 | 6 | 6 | 6 |
| Snowflake | ashby-snowflake | Yes | 368 | 119 | 220 | 29 | 29 | 29 |
| Writer | ashby-writer | Yes | 49 | 17 | 21 | 11 | 11 | 11 |
| Abridge | ashby-abridge | Yes | 40 | 11 | 29 | 0 | 0 | 0 |
| Decagon | ashby-decagon | Yes | 140 | 36 | 90 | 14 | 14 | 14 |
| Anysphere (Cursor) | ashby-cursor | Yes | 127 | 48 | 64 | 15 | 15 | 15 |
| Cognition AI | ashby-cognition | Yes | 94 | 24 | 54 | 16 | 16 | 16 |
| Poolside AI | ashby-poolside | Yes | 13 | 2 | 2 | 9 | 9 | 9 |
| Replit | ashby-replit | Yes | 76 | 26 | 47 | 3 | 3 | 3 |
| LangChain | ashby-langchain | Yes | 108 | 45 | 57 | 6 | 6 | 6 |
| Fireworks AI | ashby-fireworks | Yes | 74 | 31 | 36 | 7 | 7 | 7 |
| OpenAI | ashby-openai | Yes | 794 | 193 | 542 | 59 | 59 | 59 |
| Cohere | ashby-cohere | Yes | 145 | 62 | 42 | 41 | 41 | 41 |
| Moonshot AI | ashby-moonshot-ai | Yes | 4 | 2 | 2 | 0 | 0 | 0 |
| Reka AI | ashby-reka | Yes | 9 | 1 | 3 | 5 | 5 | 5 |
| Liquid AI | ashby-liquid-ai | Yes | 19 | 3 | 16 | 0 | 0 | 0 |
| Runway | ashby-runway | Yes | 4 | 1 | 3 | 0 | 0 | 0 |
| Midjourney | ashby-midjourney | Yes | 16 | 2 | 14 | 0 | 0 | 0 |
| ElevenLabs | ashby-elevenlabs | Yes | 246 | 95 | 84 | 67 | 67 | 67 |
| Black Forest Labs | ashby-black-forest-labs | Yes | 15 | 6 | 8 | 1 | 1 | 1 |
| Luma AI | ashby-lumaai | Yes | 44 | 17 | 25 | 2 | 2 | 2 |
| OpenRouter | ashby-openrouter | Yes | 25 | 8 | 17 | 0 | 0 | 0 |
| Perplexity AI | ashby-perplexity | Yes | 115 | 45 | 61 | 9 | 9 | 9 |
