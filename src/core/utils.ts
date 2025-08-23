import { UUID } from './types';

export function generate_uuid(prefix: string = ''): UUID {
    return prefix + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
