export const WIDE = 1280;

export const railOpen = (width, stored) => (stored === 'open' || stored === 'closed' ? stored === 'open' : width >= WIDE);

export const railState = (open) => (open ? 'open' : 'closed');

export const greetingKey = (hour) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
