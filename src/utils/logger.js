export const DEBUG_PINS = false;

export const logPinDebug = (...args) => {
    if (DEBUG_PINS) {
        console.log(...args);
    }
};
