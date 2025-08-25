import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { loadConfig } from '../config';

// Mock storage
let mockStorage: Record<string, string> = {};

const mockLocalStorage = {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, value: string) => {
        mockStorage[key] = value;
    },
    clear: () => {
        mockStorage = {};
    }
};

describe('loadConfig', () => {
    const originalFetch = global.fetch;
    const originalLocalStorage = (global as any).localStorage;

    beforeEach(() => {
        // Clear mocks and storage before each test
        vi.resetAllMocks();
        mockLocalStorage.clear();

        // Mock a browser environment for these tests
        vi.stubGlobal('fetch', vi.fn());
        vi.stubGlobal('localStorage', mockLocalStorage);
    });

    afterEach(() => {
        // Restore original globals
        vi.unstubAllGlobals();
    });

    it('should load config from localStorage if it exists', async () => {
        const storedConfig = {
            apiKey: 'local-key',
            modelName: 'local-model'
        };
        mockLocalStorage.setItem('llm_config', JSON.stringify(storedConfig));

        const config = await loadConfig();

        expect(config.llm.apiKey).toBe('local-key');
        expect(config.llm.modelName).toBe('local-model');
        // max_tokens should be merged from the default config
        expect(config.llm.max_tokens).toBe(150);
        // fetch should not be called
        expect(fetch).not.toHaveBeenCalled();
    });

    it('should fall back to config.json if localStorage is empty', async () => {
        const mockJsonConfig = {
            llm: {
                provider: 'test_provider',
                modelName: 'test_model',
                apiKey: 'test_key',
            },
        };
        (fetch as any).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockJsonConfig),
        });

        const config = await loadConfig();

        expect(fetch).toHaveBeenCalledWith('/config.json');
        expect(config.llm.provider).toBe('test_provider');
        expect(config.llm.modelName).toBe('test_model');
    });

    it('should use default config if both localStorage and config.json are unavailable', async () => {
        (fetch as any).mockResolvedValue({ ok: false });

        const config = await loadConfig();

        expect(fetch).toHaveBeenCalledWith('/config.json');
        expect(config.llm.provider).toBe('openai');
        expect(config.llm.modelName).toBe('gpt-4');
        expect(config.llm.apiKey).toBe('');
    });

    it('should use default config if localStorage is malformed', async () => {
        mockLocalStorage.setItem('llm_config', 'not a valid json');
        (fetch as any).mockResolvedValue({ ok: false }); // also make fetch fail

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const config = await loadConfig();

        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(config.llm.provider).toBe('openai');
        expect(config.llm.modelName).toBe('gpt-4');
        consoleErrorSpy.mockRestore();
    });
});
