export const DEBUG_PINS = false;

export const logPinDebug = (...args) => {
    if (DEBUG_PINS && import.meta.env.DEV) {
        console.log(...args);
    }
};
