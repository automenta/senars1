import { LLMConfig as HandlerLLMConfig } from './implementations';

// We can define a more flexible config structure here
export interface LLMConfig extends HandlerLLMConfig {
    provider?: string;
    max_tokens?: number;
}

export interface Config {
    llm: LLMConfig;
}

const defaultConfig: Config = {
    llm: {
        provider: 'openai',
        modelName: 'gpt-4',
        apiKey: '',
        max_tokens: 150,
    },
};

// Helper function to merge configs
function mergeConfig(loadedConfig: any): Config {
    return {
        ...defaultConfig,
        ...loadedConfig,
        llm: {
            ...defaultConfig.llm,
            ...loadedConfig.llm,
        },
    };
}

export async function loadConfig(): Promise<Config> {
    // Browser environment
    if (typeof window !== 'undefined' && window.localStorage) {
        // 1. Try loading from localStorage
        const storedConfigStr = window.localStorage.getItem('llm_config');
        if (storedConfigStr) {
            try {
                console.log("Loading config from localStorage.");
                const loadedConfig = JSON.parse(storedConfigStr);
                return mergeConfig({ llm: loadedConfig });
            } catch (error) {
                console.error("Error parsing config from localStorage, falling back.", error);
            }
        }

        // 2. Fallback to fetching /config.json
        try {
            console.log("localStorage config not found, fetching /config.json.");
            const response = await fetch('/config.json');
            if (response.ok) {
                const loadedConfig = await response.json();
                return mergeConfig(loadedConfig);
            } else {
                 console.warn(`config.json not found (status: ${response.status}), using default configuration.`);
            }
        } catch (error) {
            console.error("Error loading or parsing config.json, using default configuration:", error);
        }

        // 3. Use default config if all else fails
        return defaultConfig;

    } else {
        // Non-browser environment (e.g., tests in Node.js)
        console.log("Non-browser environment detected, using default config.");
        return defaultConfig;
    }
}
