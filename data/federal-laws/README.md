# Federal legal data layout

This directory keeps federal source families separate.

## U.S. Code

`us-code/` is generated from the Office of the Law Revision Counsel USLM XML release recorded in `us-code/metadata.json`.

- `title-*.json` — compact title metadata, counts, and hierarchy pointers for compatibility; law text is not duplicated here.
- `tree/title-*/` — native hierarchy: title, chapter/subchapter/part, and section directories.
- `tree/.../section-*/index.json` — authoritative normalized JSON node containing the section text, notes, official OLRC URL, and nested subsection/paragraph/subparagraph/clause structure.

The directory names use stable native type/number identifiers. Full headings remain in JSON so long source headings cannot create invalid filesystem paths.

## Public laws

Enacted public-law metadata remains in `../resources/laws.json`, sourced from Congress.gov. It is intentionally separate from codified U.S. Code; a public law is not automatically a complete current Code section.

## Congress API layout

Congress.gov is an API organized by resource family, not a statutory hierarchy. Its JSON remains under `../resources/` by collection, with bill detail and relation data in their own subdirectories when present.
