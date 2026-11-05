export const ease = [0.22, 1, 0.36, 1] as const;           // out-quint-ish
export const dur = { micro: 0.12, small: 0.2, page: 0.32, draw: 0.8 };
export const spring = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;
