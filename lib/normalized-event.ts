import type { CanonicalEventName } from './event-catalog';

export interface NormalizedEvent {
	eventId: string;
	canonicalName: CanonicalEventName;
	eventTime: number; // unix seconds
	sourceUrl: string;
	actionSource: 'website' | 'system_generated';
	user: {
		email?: string;
		phone?: string;
		firstName?: string;
		lastName?: string;
		externalId?: string;
		// ID interno não-PII (ex: UUID do lead no Supabase) — usado como
		// user_id do GA4 quando enviamos user_data. Nunca preencha com PII.
		internalId?: string;
		clientIp?: string;
		userAgent?: string;
		fbp?: string | null;
		fbc?: string | null;
		gaClientId?: string | null;
		// Opcionais, mas recomendados pela Meta pra melhorar o match — inclua
		// sempre que disponível, mesmo que todo o público seja do mesmo país.
		city?: string;
		state?: string;
		zip?: string;
		countryIso?: string; // ISO 3166-1 alpha-2, ex: "BR"
		street?: string;
	};
	commerce?: {
		transactionId?: string;
		value?: number;
		currency?: string;
		productId?: string;
		productName?: string;
		paymentMethod?: string;
		subscriptionId?: string;
	};
	raw?: unknown;
}
