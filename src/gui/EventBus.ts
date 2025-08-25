type EventHandler = (...args: any[]) => void;

export class EventBus {
    private listeners: { [key: string]: EventHandler[] } = {};

    public on(event: string, handler: EventHandler): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(handler);
    }

    public off(event: string, handler: EventHandler): void {
        if (!this.listeners[event]) {
            return;
        }
        this.listeners[event] = this.listeners[event].filter(
            (l) => l !== handler
        );
    }

    public emit(event: string, ...args: any[]): void {
        if (!this.listeners[event]) {
            return;
        }
        this.listeners[event].forEach((handler) => {
            try {
                handler(...args);
            } catch (e) {
                console.error(`Error in event handler for ${event}:`, e);
            }
        });
    }
}
