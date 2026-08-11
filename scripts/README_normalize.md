Normalize IDIQ to SmartCredit-like JSON

Usage

1. Quick wrapper (no mapping):

```
node scripts/normalize_idiq_to_smartcredit.js path/to/IDIQraw.json path/to/output_smartcredit.json
```

2. Using a mapping to extract components:

```
node scripts/normalize_idiq_to_smartcredit.js path/to/IDIQraw.json path/to/output.json scripts/normalize_map.example.json
```

How it works

- Without a mapping file the script will produce a minimal SmartCredit-like wrapper:
  `report.BundleComponents.BundleComponent[0].SourceRaw` contains the entire input.
- With a mapping file (see `normalize_map.example.json`) the script will attempt to extract the listed `path` values
  from the input and emit them as separate `BundleComponent` entries with the configured `type`.

Next steps

- Edit `normalize_map.example.json` to match the actual keys/paths in your `IDIQraw.json` (use dot paths for nested values).
- Run the script and inspect `output.json` to confirm equivalence to your `SmartCreditRaw.json` structure.
- If you want, I can run the script on your `IDIQraw.json` and produce a converted file in the repo.
