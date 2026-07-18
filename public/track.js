( function () {
	function getCookie( name ) {
		const match = document.cookie.match( new RegExp( '(^| )' + name + '=([^;]+)' ) );
		return match ? decodeURIComponent( match[ 2 ] ) : null;
	}

	function getParam( name ) {
		return new URLSearchParams( window.location.search ).get( name );
	}

	// Extrai o client_id "real" do cookie _ga (formato GA1.2.XXXXXXXXX.YYYYYYYYYY)
	function getGaClientId() {
		const raw = getCookie( '_ga' );
		if ( !raw ) return null;
		const parts = raw.split( '.' );
		return parts.length >= 4 ? parts.slice( -2 ).join( '.' ) : null;
	}

	// Persiste UTMs e clickids no primeiro acesso, mesmo que o usuário
	// navegue por várias páginas antes de converter
	const stored = JSON.parse( localStorage.getItem( '_track_ctx' ) || '{}' );
	const ctx = {
		utm_source: getParam( 'utm_source' ) || stored.utm_source || null,
		utm_medium: getParam( 'utm_medium' ) || stored.utm_medium || null,
		utm_campaign: getParam( 'utm_campaign' ) || stored.utm_campaign || null,
		utm_term: getParam( 'utm_term' ) || stored.utm_term || null,
		utm_content: getParam( 'utm_content' ) || stored.utm_content || null,
		fbclid: getParam( 'fbclid' ) || stored.fbclid || null,
		gclid: getParam( 'gclid' ) || stored.gclid || null,
	};
	localStorage.setItem( '_track_ctx', JSON.stringify( ctx ) );

	// API pública: chame em qualquer lugar do site
	// trackEvent('Lead', { email, phone, product: 'Simplificando a Matemática' })
	window.trackEvent = function ( eventName, data ) {
		const payload = Object.assign(
			{
				event_name: eventName,
				event_id: crypto.randomUUID(),
				source_url: window.location.href,
				fbp: getCookie( '_fbp' ),
				fbc: getCookie( '_fbc' ),
				ga_client_id: getGaClientId(),
			},
			ctx,
			{ custom_data: data || {} },
			data && data.email ? { email: data.email } : {},
			data && data.phone ? { phone: data.phone } : {},
			data && data.name ? { name: data.name } : {},
			data && data.product ? { product: data.product } : {}
		);

		const body = JSON.stringify( payload );
		if ( navigator.sendBeacon )
		{
			navigator.sendBeacon( '/api/collect', body );
		} else
		{
			fetch( '/api/collect', { method: 'POST', body, keepalive: true } );
		}
	};

	// Dispara PageView automático a cada carregamento
	window.trackEvent( 'PageView' );
} )();
