import { io } from 'socket.io-client';
import { API_BASE } from './api';

export const initSocket = async () => {
    const options = {
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling'],
    };

    // Same protocol as the page so HTTPS deployments never fall back to ws/http
    const backendUrl =
        API_BASE ||
        (typeof window !== 'undefined' && window.location.port !== '5000'
            ? `${window.location.protocol}//${window.location.hostname || 'localhost'}:5000`
            : '/');

    return io(backendUrl, options);
};

