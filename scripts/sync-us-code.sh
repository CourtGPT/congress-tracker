#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${ROOT_DIR}/.cache/us-code"
DOWNLOAD_DIR="${CACHE_DIR}/xml"
SOURCE_PAGE="https://uscode.house.gov/download/download.shtml"

rm -rf "${CACHE_DIR}"
mkdir -p "${DOWNLOAD_DIR}"
curl --fail --location --http1.1 --silent --show-error --retry 5 --retry-all-errors --retry-delay 3 "${SOURCE_PAGE}" -o "${CACHE_DIR}/release-page.html"

python3 - "${CACHE_DIR}/release-page.html" "${CACHE_DIR}/release.json" <<'PY'
import json, re, sys
from html import unescape
from pathlib import Path

html = unescape(Path(sys.argv[1]).read_text(encoding='utf-8'))
release = re.search(r'Current Release Point.*?Public Law\s+([0-9]+)-([0-9]+)\s*\(([^)]+)\)', html, re.I | re.S)
archive = re.search(r'href="([^"]*xml_uscAll@([0-9]+)-([0-9]+)\.zip)"', html, re.I)
if not release or not archive: raise SystemExit('Could not locate OLRC release point and XML archive')
congress, law, date = release.groups(); relative, archive_congress, archive_law = archive.groups()
if (congress, law) != (archive_congress, archive_law): raise SystemExit('OLRC release identifiers do not match')
url = relative if relative.startswith('http') else 'https://uscode.house.gov/download/' + relative.lstrip('/')
Path(sys.argv[2]).write_text(json.dumps({'source':'Office of the Law Revision Counsel','sourcePage':'https://uscode.house.gov/download/download.shtml','releasePoint':f'{congress}-{law}','publicLaw':f'Public Law {congress}-{law}','releaseDate':date,'archiveUrl':url}, indent=2) + '\n', encoding='utf-8')
PY

ARCHIVE_URL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["archiveUrl"])' "${CACHE_DIR}/release.json")"
curl --fail --location --http1.1 --silent --show-error --retry 5 --retry-all-errors --retry-delay 3 "${ARCHIVE_URL}" -o "${CACHE_DIR}/usc.xml.zip"
unzip -q -t "${CACHE_DIR}/usc.xml.zip"
unzip -q "${CACHE_DIR}/usc.xml.zip" -d "${DOWNLOAD_DIR}"
US_CODE_XML_DIR="${DOWNLOAD_DIR}" US_CODE_RELEASE_PATH="${CACHE_DIR}/release.json" node "${ROOT_DIR}/scripts/parse-us-code.js"
npm --prefix "${ROOT_DIR}" run validate:laws
