export interface MetaEventObject {
	event_name: string;
	event_time: number;
	event_id: string;
	event_source_url?: string;
	action_source: string;
	user_data: Record<string, unknown>;
	custom_data: Record<string, unknown>;
}

// Só envia — a formatação/hashing fica em lib/format-meta.ts
export async function postMetaEvents( events: MetaEventObject[] ) {
	const pixelId = process.env.META_PIXEL_ID!;
	const accessToken = process.env.META_ACCESS_TOKEN!;

	const body: Record<string, unknown> = { data: events };
	if ( process.env.META_TEST_EVENT_CODE )
	{
		body.test_event_code = process.env.META_TEST_EVENT_CODE;
	}

	const res = await fetch(
		`https://graph.facebook.com/v25.0/${pixelId}/events?access_token=${accessToken}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( body ),
		}
	);

	const json = await res.json().catch( () => null );
	return { ok: res.ok, status: res.status, response: json };
}
