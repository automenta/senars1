import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { loadConfig } from '../config';

describe('loadConfig', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        global.fetch = originalFetch;
    });

    it('should load the default config if config.json is not found', async () => {
        (fetch as any).mockResolvedValue({ ok: false });

        const config = await loadConfig();
        expect(config.llm.provider).toBe('openai');
        expect(config.llm.modelName).toBe('gpt-4');
        expect(fetch).toHaveBeenCalledWith('/config.json');
    });

    it('should load the config from config.json if it exists', async () => {
        const mockConfig = {
            llm: {
                provider: 'test_provider',
                modelName: 'test_model',
                apiKey: 'test_key',
            },
        };
        (fetch as any).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockConfig),
        });

        const config = await loadConfig();
        expect(config.llm.provider).toBe('test_provider');
        expect(config.llm.modelName).toBe('test_model');
        expect(config.llm.apiKey).toBe('test_key');
        // max_tokens should be from default config
        expect(config.llm.max_tokens).toBe(150);
    });

    it('should use default config if config.json is malformed', async () => {
        (fetch as any).mockResolvedValue({
            ok: true,
            json: () => Promise.reject(new Error('Malformed JSON')),
        });

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const config = await loadConfig();
        expect(config.llm.provider).toBe('openai');
        expect(config.llm.modelName).toBe('gpt-4');

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });
});
