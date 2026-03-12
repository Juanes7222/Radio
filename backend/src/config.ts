import 'dotenv/config';

function required(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Env ${key} is not defined`);
    return val;
}

export const config = {
    port: parseInt(process.env.PORT ?? '3001', 10),
    azuracast: {
        url:       required('AZURACAST_URL').replace(/\/$/, ''),
        apiKey:    required('AZURACAST_API_KEY'),
        stationId: required('AZURACAST_STATION_ID'),
    },
    google: {
        clientId: required('GOOGLE_CLIENT_ID'),
    },
    jwt: {
        secret:    required('JWT_SECRET'),
        expiresIn: '24h' as const,
    },
    whitelist: (process.env.ADMIN_WHITELIST ?? '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean),
    publicUrl:   (process.env.PUBLIC_URL ?? '').replace(/\/$/, ''),
    panelSecret: required('PANEL_SECRET'),
};
