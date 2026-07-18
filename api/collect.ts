import { supabase } from '../lib/supabase';
import { dispatchEvent } from '../lib/dispatch-event';
import type { NormalizedEvent } from '../lib/normalized-event';
import type { CanonicalEventName } from '../lib/event-catalog';

export const config = { runtime: 'edge' };

interface CollectPayload {
	event_name: CanonicalEventName;
	event_id: string;
	email?: string;
	phone?: string;
	name?: string;
	product?: string;
	source_url: string;
	fbp?: string | null;
	fbc?: string | null;
	ga_client_id?: string;
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
	fbclid?: string;
	gclid?: string;
	value?: number;
	currency?: string;
}

export default async function handler( req: Request ): Promise<Response> {
	if ( req.method !== 'POST' )
	{
		return new Response( 'Method not allowed', { status: 405 } );
	}

	let payload: CollectPayload;
	try
	{
		payload = await req.json();
	} catch
	{
		return new Response( 'Invalid JSON', { status: 400 } );
	}

	if ( !payload.event_name || !payload.event_id )
	{
		return new Response( 'Missing event_name or event_id', { status: 400 } );
	}

	const clientIp = req.headers.get( 'x-forwarded-for' )?.split( ',' )[ 0 ]?.trim() ?? '';
	const userAgent = req.headers.get( 'user-agent' ) ?? '';

	// 1. Grava/atualiza o lead no Supabase (CRM)
	let leadId: string | null = null;
	if ( payload.email )
	{
		const { data: leadRow, error: leadError } = await supabase
			.from( 'leads' )
			.upsert(
				{
					email: payload.email,
					phone: payload.phone,
					name: payload.name,
					product: payload.product,
					utm_source: payload.utm_source,
					utm_medium: payload.utm_medium,
					utm_campaign: payload.utm_campaign,
					utm_term: payload.utm_term,
					utm_content: payload.utm_content,
					fbclid: payload.fbclid,
					gclid: payload.gclid,
					fbp: payload.fbp,
					fbc: payload.fbc,
					ga_client_id: payload.ga_client_id,
					source_url: payload.source_url,
					last_event_name: payload.event_name,
				},
				{ onConflict: 'email' }
			)
			.select( 'id' )
			.single();

		if ( leadError )
		{
			console.error( 'Erro ao gravar lead no Supabase:', leadError.message );
		} else
		{
			leadId = leadRow?.id ?? null;
		}
	}

	// 2. Normaliza e despacha pelo mesmo pipeline central (formatação por
	//    plataforma + dedup) usado pelo webhook da Hotmart
	const [ firstName, ...restName ] = ( payload.name ?? '' ).split( ' ' ).filter( Boolean );
	const lastName = restName.join( ' ' );

	const normalized: NormalizedEvent = {
		eventId: payload.event_id,
		canonicalName: payload.event_name,
		eventTime: Math.floor( Date.now() / 1000 ),
		sourceUrl: payload.source_url,
		actionSource: 'website',
		user: {
			email: payload.email,
			phone: payload.phone,
			firstName: firstName || undefined,
			lastName: lastName || undefined,
			internalId: leadId ?? undefined,
			clientIp,
			userAgent,
			fbp: payload.fbp,
			fbc: payload.fbc,
			gaClientId: payload.ga_client_id,
		},
		commerce:
			payload.value !== undefined || payload.product
				? {
					value: payload.value,
					currency: payload.currency ?? 'BRL',
					productName: payload.product,
				}
				: undefined,
		raw: payload,
	};

	const result = await dispatchEvent( normalized, leadId );

	return new Response( JSON.stringify( { ok: true, ...result } ), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	} );
}
