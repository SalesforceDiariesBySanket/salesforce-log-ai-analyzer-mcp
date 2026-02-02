# Test Fixtures

This folder contains test data for unit and integration tests.

## Structure

```
__fixtures__/
├── logs/
│   ├── simple/           # Simple success logs
│   ├── soql/             # SOQL limit and query logs
│   ├── exceptions/       # Exception with stack traces
│   ├── managed-pkg/      # Managed package boundary logs
│   ├── truncated/        # Truncated 20MB+ logs
│   └── async/            # Async job correlation logs
└── expected/             # Expected parser output (gold files)
```

## Adding Fixtures

1. Place raw `.log` files in appropriate subfolder
2. Name format: `[scenario]-[variant].log`
3. Add expected output in `expected/[same-name].json`
4. Document the fixture in this README
