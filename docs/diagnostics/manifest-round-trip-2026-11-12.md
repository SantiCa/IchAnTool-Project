# Manifest encoding and editing verification

Roadmap task M3.3.3 (AUD-06), authorised on 12 November 2026. Editor: Codex; author verification,
no independent reviewer assigned. Baseline: V0.136, commit `4b836e6`. Delivery: V0.137.

## Reproduction and findings

The reported double escape is not reproduced. `write_manifest_template` protects formula-like strings,
doubles original leading apostrophes only in marked rows, and writes `apostrophe-v1` in the row marker.
`spreadsheet_text` leaves a string that already starts with an apostrophe unchanged. `read_manifest`
removes exactly one leading apostrophe from each marked string field. The existing encoding and reader
decoding remain unchanged in this delivery.

| Input and path | Baseline outcome | Delivery outcome |
|---|---|---|
| Unmarked `'section.png` in an ordinary core | Original apostrophe preserved | Identical |
| Marked row: original `'section.png` and core `=Core` | CSV contains `''section.png` and `'=Core`; both decode exactly | Identical |
| Marked row mixing ordinary text, an original apostrophe and formula-like text | Each field decodes according to its own content | Identical |
| Unmarked core `NA` from a generated template | Replaced with the manifest stem `sections` | Literal `NA` preserved |
| Unmarked name `NA` with image `section.png` | Replaced with the image stem `section` | Literal `NA` preserved |
| Unmarked image path `NA` | Reported as an empty required image | Literal path resolved from the manifest folder |
| Empty optional fields | Documented defaults/absent exclusion | Identical |

The reproduced defect is pandas' default missing-value vocabulary, rather than apostrophe encoding.
The manifest reader now disables that vocabulary and recognises the empty field as missing. String
columns preserve `NA`, `N/A`, `NULL`, `null`, `NaN`, `#N/A`, `None`, `<NA>` and numeric-looking IDs.
Depths remain float64; valid numeric depth values and analysis calculations are unchanged. Numeric fields
must still contain numbers, and missing required fields remain errors.

## Reproducible checks

Run from the repository with its existing development environment:

```powershell
py -3.12 -m pytest -q tests/test_manifest_contract.py tests/test_batch.py tests/test_io_security.py
```

The new contract suite has 40 cases. Ten generated-template cases combine five core names with CSV and
XLSX editing paths. Each lists eleven real 2 × 2 synthetic masks and matching half-exclusion images,
including original apostrophes, `-`, `+`, `=`, `@`, leading whitespace, ordinary text, missing-value-like
names, Unicode and CSV commas. The template's encoded values are inspected before editing depths.
After reimport, paths, core/section names and exclusion paths must match exactly. Batch analysis requires
100% bioturbation, 50% valid pixels and BI/ii = 6 for every resulting interval.

The workbook path imports string cells literally, edits depth cells as numbers, writes XLSX with openpyxl,
reopens it, checks text/numeric cell types and serialises those stored values back to CSV. It does not run
the cells as formulas. Additional cases edit marked-row strings using the documented existing encoding,
preserve unmarked strings, mix marked/unmarked rows and retain empty-cell defaults. Existing security
regressions verify formula protection in CSV/XLSX result exports and unchanged numeric depths.

Environment: Windows 11 build 26300, Python 3.12.4, pandas 2.2.2, NumPy 1.26.4, openpyxl 3.1.2.
All fixture content is synthetic. No user project or spreadsheet is opened.

## Editing contract and limits

The [technical reference](../TECHNICAL_DOCUMENTATION.md#2561-manifest-text-encoding-and-editing) defines
the marker, byte-level examples and supported edits. Editing depths while preserving encoded text and
the marker needs no migration. Replacing a marked text cell with an unencoded original apostrophe is
outside that contract: the decoder cannot distinguish it from a protection prefix. Such edits must use
the documented encoding. No ambiguous automatic repair or new manifest version is introduced.

The workbook check validates XLSX file persistence through openpyxl, not a native Excel/LibreOffice user
interface or a client's automatic CSV conversion. A native Excel launch was unavailable under the local
automation permission policy. Native-client and locale-specific import/export behaviour remains unverified;
do not infer that double-clicking CSV in any spreadsheet preserves these strings. Import literal text,
preserve marker/prefix bytes and check the resulting comma-separated UTF-8 CSV.
