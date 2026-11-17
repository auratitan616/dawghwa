# On-device recommendations

Everything runs in the browser or WebView. No external AI service, no API key, and no reading data leaves the device. Code: `src/lib/intel/`.

## Pipeline

1. **Features** (`features.ts`, `themes.ts`): each title becomes a sparse hashed vector from the API's metadata: format, status, demographic, tags, year bucket, popularity bucket, and story themes detected only from words actually present in the description.
2. **Signals** (`signals.ts`): interactions are logged per profile in IndexedDB and mapped to training labels.
3. **Learner** (`learner.ts`): deterministic replay of events into a logistic model plus short-term (14-day half-life) and long-term (365-day) taste vectors. Repeated chapter reads of one title have diminishing weight. Only the latest explicit opinion per title counts.
4. **Ranking** (`rank.ts`): model score + taste similarity + onboarding preferences, MMR re-ranking for variety, a small exploration slot, and exclusion of hidden titles. A new profile keeps catalogue order until there is evidence.
5. **Runtime** (`worker.ts`, `runtime.ts`): training runs in a Web Worker; state is stored per profile.

## Signal rules

| Signal | Effect |
| --- | --- |
| Open a title | Very weak positive (0.08). Never a negative. |
| Read to the end of a chapter | Positive (0.45), diminishing per title |
| Finish a title, favourite, like | Strong positive |
| Add to library, "More like this", return after 6h+ | Positive |
| Dislike, Not interested, Hide, Dropped | Negative (explicit actions only) |
| Scrolling past a recommendation | Not a signal |
| Failed images, broken pages, errors | Not a signal |
| Unhide | Cancels the earlier hide |

## Explanations

"Because you read X" and similar reasons are built only from the profile's real events and the shared features between titles. If there is no evidence, no reason is shown.

## Evaluation

`npm run eval:intel` runs simulated readers over 1,008 real MangaDex titles captured from the API (`src/test/fixtures/catalog.json`). Each persona likes titles matching a metadata predicate; some liked titles are used as training events, the rest are held out. The model is compared with a popularity baseline.

Latest local run (NDCG@10 / Recall@50, model vs popularity):

| Persona | Model | Popularity |
| --- | --- | --- |
| Action fantasy manhwa | 1.000 / 0.88 | 0.000 / 0.00 |
| Romance manga | 1.000 / 1.00 | 0.066 / 0.26 |
| Martial arts manhua | 0.931 / 0.74 | 0.000 / 0.00 |
| Psychological / horror | 0.727 / 0.71 | 0.000 / 0.07 |
| Comedy slice of life | 1.000 / 1.00 | 0.208 / 0.30 |
| Noisy mixed reader | 1.000 / 0.98 | 0.000 / 0.02 |

These numbers are optimistic: personas are defined by the same metadata the model learns from, so they show the model can recover a consistent taste, not how well it predicts real people. Real-world quality needs consented, anonymised usage data, which Dawghwa does not collect.

The test suite asserts the model beats the baseline, never recommends hidden titles or duplicates, respects onboarding avoid lists, and explains only with real evidence.
