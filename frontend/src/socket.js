import { io } from 'socket.io-client';

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

    const backendUrl =
        process.env.REACT_APP_BACKEND_URL ||
        (typeof window !== 'undefined' && window.location.port !== '5000'
            ? `http://${window.location.hostname || 'localhost'}:5000`
            : '/');

    return io(backendUrl, options);
};

