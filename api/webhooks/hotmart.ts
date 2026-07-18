import { supabase } from '../../lib/supabase';
import { dispatchEvent } from '../../lib/dispatch-event';
import { mapHotmartEvent, extractTrackingCode, parseHotmartData } from '../../lib/hotmart';
import { getCheckoutTracking } from '../../lib/checkout-tracking';
import type { NormalizedEvent } from '../../lib/normalized-event';

export const config = { runtime: 'edge' };

// Cadastre esta URL em Hotmart > Ferramentas > Webhook (API e notificações)
// > + Cadastrar Webhook, versão 2.0.0, marcando todos os eventos de compra,
// assinatura e área de membros que quiser rastrear.
export default async function handler( req: Request ): Promise<Response> {
	if ( req.method !== 'POST' )
	{
		return new Response( 'Method not allowed', { status: 405 } );
	}

	let payload: any;
	try
	{
		payload = await req.json();
	} catch
	{
		return new Response( 'Invalid JSON', { status: 400 } );
	}

	// A Hotmart manda o Hottok no header X-HOTMART-HOTTOK (configs mais
	// recentes) ou no campo "hottok" do corpo (configs legadas) — checamos
	// os dois. Sem isso, qualquer um poderia forjar uma "compra aprovada".
	const headerToken = req.headers.get( 'x-hotmart-hottok' );
	const bodyToken = payload?.hottok;
	const token = headerToken ?? bodyToken;
	if ( !token || token !== process.env.HOTMART_HOTTOK )
	{
		return new Response( 'Invalid hottok', { status: 401 } );
	}

	const canonicalName = mapHotmartEvent( payload.event );
	if ( !canonicalName )
	{
		// Evento que a Hotmart manda mas ainda não mapeamos (ver lib/hotmart.ts).
		// Devolve 200 pra Hotmart não ficar reenviando, só loga pra decidir depois.
		console.warn( 'Evento Hotmart não mapeado:', payload.event );
		return new Response( JSON.stringify( { ok: true, ignored: payload.event } ), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		} );
	}

	const data = payload.data ?? {};
	const parsed = parseHotmartData( data, payload.creation_date ?? Date.now() );
	const trackingCode = extractTrackingCode( data );
	const tracking = trackingCode ? await getCheckoutTracking( trackingCode ) : null;

	// Dedup determinístico: a Hotmart reenvia o webhook em caso de erro (até
	// 5x). Usando sempre o mesmo event_id pra (transação + tipo de evento),
	// o dispatchEvent detecta que já processou e não duplica no Meta/GA4.
	const dedupKey = parsed.transactionId ?? payload.id;
	const eventId = `hotmart_${dedupKey}_${canonicalName}`;

	const [ firstName, ...restName ] = ( parsed.buyerName ?? '' ).split( ' ' ).filter( Boolean );
	const lastName = restName.join( ' ' );

	let leadId: string | null = null;
	if ( parsed.buyerEmail )
	{
		const { data: leadRow, error: leadError } = await supabase
			.from( 'leads' )
			.upsert(
				{
					email: parsed.buyerEmail,
					phone: parsed.buyerPhone,
					name: parsed.buyerName,
					product: parsed.productName,
					fbp: tracking?.fbp,
					fbc: tracking?.fbc,
					ga_client_id: tracking?.ga_client_id,
					utm_source: tracking?.utm_source,
					utm_medium: tracking?.utm_medium,
					utm_campaign: tracking?.utm_campaign,
					utm_term: tracking?.utm_term,
					utm_content: tracking?.utm_content,
					source_url: 'hotmart_checkout',
					last_event_name: canonicalName,
				},
				{ onConflict: 'email' }
			)
			.select( 'id' )
			.single();

		if ( leadError )
		{
			console.error( 'Erro ao gravar lead a partir do webhook Hotmart:', leadError.message );
		} else
		{
			leadId = leadRow?.id ?? null;
		}
	}

	const normalized: NormalizedEvent = {
		eventId,
		canonicalName,
		eventTime: Math.floor( ( parsed.eventTimeMs ?? Date.now() ) / 1000 ),
		sourceUrl: 'https://hotmart.com/checkout', // não temos a URL real do site aqui, só do checkout
		actionSource: tracking ? 'website' : 'system_generated',
		user: {
			email: parsed.buyerEmail,
			phone: parsed.buyerPhone,
			firstName: firstName || undefined,
			lastName: lastName || undefined,
			externalId: parsed.transactionId,
			internalId: leadId ?? undefined,
			clientIp: tracking?.client_ip,
			userAgent: tracking?.user_agent,
			fbp: tracking?.fbp,
			fbc: tracking?.fbc,
			gaClientId: tracking?.ga_client_id,
			city: parsed.buyerCity,
			state: parsed.buyerState,
			zip: parsed.buyerZip,
			countryIso: parsed.buyerCountryIso,
			street: parsed.buyerStreet,
		},
		commerce: {
			transactionId: parsed.transactionId,
			value: parsed.value,
			currency: parsed.currency,
			productId: parsed.productId,
			productName: parsed.productName,
			paymentMethod: parsed.paymentMethod,
			subscriptionId: parsed.subscriptionId,
		},
		raw: payload,
	};

	const result = await dispatchEvent( normalized, leadId );

	// Mantém uma visão comercial simples pro CRM/dashboard: uma linha por
	// transação, sempre com o status mais recente (upsert por transaction_id)
	if ( parsed.transactionId )
	{
		await supabase.from( 'purchases' ).upsert(
			{
				transaction_id: parsed.transactionId,
				buyer_email: parsed.buyerEmail,
				buyer_name: parsed.buyerName,
				product_name: parsed.productName,
				value: parsed.value,
				currency: parsed.currency,
				payment_method: parsed.paymentMethod,
				status: canonicalName,
				is_subscription: Boolean( parsed.subscriptionId ),
			},
			{ onConflict: 'transaction_id' }
		);
	}

	return new Response( JSON.stringify( { ok: true, ...result } ), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	} );
}
