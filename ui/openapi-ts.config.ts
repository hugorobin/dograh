import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
    // Run `python3 scripts/merge_openapi_phone_numbers.py` first (writes openapi.json).
    input: './openapi.json',
    output: 'src/client',
    plugins: [{
        name: '@hey-api/client-fetch',
        runtimeConfigPath: '../lib/apiClient',
    }],
});
