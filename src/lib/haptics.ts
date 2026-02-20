import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Medium) => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Haptics.impact({ style });
        } catch (error) {
            console.warn("Haptics not available:", error);
        }
    }
};

export const triggerHapticSuccess = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Haptics.notification({ type: 'SUCCESS' as any });
        } catch (error) {
            console.warn("Haptics not available:", error);
        }
    }
};

export const triggerHapticWarning = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Haptics.notification({ type: 'WARNING' as any });
        } catch (error) {
            console.warn("Haptics not available:", error);
        }
    }
};

export const triggerHapticSelection = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Haptics.selectionStart();
        } catch (error) {
            console.warn("Haptics not available:", error);
        }
    }
};
