export interface Ga4Address {
	sha256_first_name?: string;
	sha256_last_name?: string;
	sha256_street?: string;
	city?: string;
	region?: string;
	postal_code?: string;
	country?: string;
}

export interface Ga4UserData {
	sha256_email_address?: string;
	sha256_phone_number?: string;
	address?: Ga4Address;
}

export interface Ga4Payload {
	client_id: string;
	// user_id é obrigatório sempre que user_data é enviado (exigência do GA4).
	// Usamos um ID interno não-PII (o UUID do lead no Supabase) — nunca a
	// própria PII, seguindo a recomendação do Google de não usar dado
	// diretamente identificável como User-ID.
	user_id?: string;
	user_data?: Ga4UserData;
	events: Array<{ name: string; params: Record<string, unknown>; }>;
}

// Só envia — a formatação/hashing fica em lib/format-ga4.ts
export async function postGa4Event( payload: Ga4Payload ) {
	const measurementId = process.env.GA4_MEASUREMENT_ID!;
	const apiSecret = process.env.GA4_API_SECRET!;

	const res = await fetch(
		`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
		{
			method: 'POST',
			body: JSON.stringify( payload ),
		}
	);

	// Produção responde 204 sem corpo. Para depurar payloads, troque a URL
	// acima por www.google-analytics.com/debug/mp/collect temporariamente —
	// ela retorna um JSON com os erros de validação do payload.
	return { ok: res.ok, status: res.status };
}
