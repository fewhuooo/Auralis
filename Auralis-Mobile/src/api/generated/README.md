# Generated API SDK

`schema.ts` is generated from `docs/contracts/openapi/auralis-openapi.json` with
`openapi-typescript@7.13.0`. Do not edit the generated schema manually.

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-openapi-sdk.ps1
powershell -ExecutionPolicy Bypass -File scripts/check-openapi.ps1
```

`client.ts` is the small typed adapter around the existing Mobile request
pipeline; its endpoint paths, methods, request bodies, path/query parameters,
and success payloads are constrained by `schema.ts`. The checked-in artifact
and both generated schemas must be regenerated together.
