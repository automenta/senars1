import { vi } from 'vitest';

const mockFetch = vi.fn().mockImplementation(async (url: string) => {
    if (url === '/config.json') {
        return {
            ok: true,
            json: () => Promise.resolve({
                llm: {
                    provider: 'mock_provider',
                    modelName: 'mock_model',
                    apiKey: 'mock_key',
                }
            }),
        };
    }
    return {
        ok: false,
        status: 404,
    };
});

vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
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
vi.stubGlobal('localStorage', mockLocalStorage);
