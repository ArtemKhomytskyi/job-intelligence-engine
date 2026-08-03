# Extraction pipeline audit

## Scope and result

This audit traces structured job information from source payload to the
versioned normalized JSON payload. It uses synthetic fixtures only. The main
defect was not missing collection or persistence: descriptions arrived, but
most facts were never recognized. The new `normalization-v2` analysis retains
the existing collector/scoring contracts while substantially expanding
deterministic coverage.

## Loss boundaries

| Boundary                 | Previous loss                                                                                                                                              | Resolution                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greenhouse API           | HTML content reached storage, but headings and list items were reduced to undifferentiated prose before narrow regexes ran.                                | HTML cleanup now preserves line and bullet boundaries; layered section/bullet/sentence analysis runs during processing.                                       |
| Lever API                | `descriptionPlain` replaced rich `description`; `lists` and `additional` sections were ignored.                                                            | Rich description is preferred and bounded list/additional sections are appended with escaped headings.                                                        |
| Generic JSON-LD          | Skills, qualifications, experience, education, responsibilities, benefits, and incentive compensation were discarded or opaque.                            | Safe Schema.org fields are retained in `structuredJobData`; salary is flattened into parseable evidence.                                                      |
| Generic semantic HTML    | Only the first matching job-description container was read. Split requirements/benefits containers were lost.                                              | Up to 20 top-level matching description sections are combined in document order.                                                                              |
| HTML-to-text conversion  | List identity was removed, weakening section and evidence confidence.                                                                                      | List items retain a `- ` marker and headings retain line boundaries.                                                                                          |
| Processing normalization | Seven technology aliases, six spoken languages, and narrow years/education/authorization patterns left most evidence unknown.                              | A bounded pure analyzer now applies structured, section, bullet, sentence, taxonomy, and policy layers. Legacy conservative rules remain fallback enrichment. |
| Normalized payload       | No representation existed for certifications, benefit/responsibility/qualification groups, contract/travel, sponsorship, clearance, or relocation support. | `descriptionAnalysis` adds these groups with source, strategy, confidence, and evidence; existing scoring-facing arrays are enriched.                         |
| Processing idempotency   | Re-running v1 would skip already processed descriptions despite new semantics.                                                                             | `NORMALIZATION_VERSION` advances to `normalization-v2`; v1 decision history remains immutable.                                                                |

## Layer order

1. **Structured source data:** JSON-LD and ATS metadata receive confidence
   `0.98` and are considered before prose facts.
2. **Semantic HTML:** headings and top-level description regions establish
   document order and section source.
3. **Section detection:** aliases classify responsibilities, required,
   preferred, nice-to-have, benefits, compensation, and work arrangements.
4. **Bullet analysis:** retained list markers raise deterministic confidence and
   become `BulletPattern` evidence for section facts.
5. **Sentence rules:** fixed dictionaries and bounded regular expressions derive
   terms, years, education, spoken language, salary, and policy facts.

Layers append facts. Deduplication retains the first higher-confidence fact for
the same canonical identity; it does not replace the entire previous layer.

## Extracted groups

- programming languages, frameworks, cloud providers, databases, platforms,
  protocols, and engineering practices;
- experience ranges and minimums, education/equivalent experience,
  certifications, and spoken language/proficiency;
- work authorization, visa sponsorship, security clearance, relocation support,
  remote policy/scope, employment type, contract wording, and travel percentage;
- salary/range/currency/period/gross-net evidence;
- benefits, responsibilities, required qualifications, preferred
  qualifications, and nice-to-have qualifications.

## Determinism and bounds

The analyzer reads at most 100,000 description characters and 2,000 lines,
limits structured/sentence expansion and each result group, uses only fixed
regular expressions and dictionaries, and performs no network access, dynamic
regex compilation from source content, fuzzy matching, geocoding, currency
conversion, annualization, LLM inference, or external API call.

Malformed or empty content returns partial or empty groups rather than failing a
pipeline run. Company-history years, ordinary language mentions, and explicitly
negated technology requirements have regression coverage to limit false
positives.

## Explainability contract

New facts optionally expose:

```text
extraction.source      section heading or structured field
extraction.strategy    stable deterministic rule name
extraction.confidence  fixed value derived from layer/context
evidence               bounded source sentence or bullet
```

Confidence explains evidence quality; it is not a suitability score and does
not alter scoring weights.
