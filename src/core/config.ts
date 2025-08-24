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

export async function loadConfig(): Promise<Config> {
    try {
        const response = await fetch('/config.json');
        if (!response.ok) {
            console.warn(`config.json not found (status: ${response.status}), using default configuration.`);
            return defaultConfig;
        }
        const loadedConfig = await response.json();
        // Deep merge with defaults to ensure all keys are present
        const config = {
            ...defaultConfig,
            ...loadedConfig,
            llm: {
                ...defaultConfig.llm,
                ...loadedConfig.llm,
            },
        };
        return config;
    } catch (error) {
        console.error("Error loading or parsing config.json, using default configuration:", error);
        return defaultConfig;
    }
}
