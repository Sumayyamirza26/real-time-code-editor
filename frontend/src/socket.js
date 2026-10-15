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

    // Connect to API_BASE if set; otherwise in local development connect to port 5000
    const isLocalDev =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const backendUrl =
        API_BASE ||
        (isLocalDev
            ? `${window.location.protocol}//${window.location.hostname}:5000`
            : '/');

    return io(backendUrl, options);
};

