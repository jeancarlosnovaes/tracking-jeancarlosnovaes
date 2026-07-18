# Tracking server-side (Meta CAPI + GA4 + Hotmart + CRM) — Supabase + Vercel

Sem GTM, sem Stape. Dois pontos de entrada — `/api/collect` (eventos do site)
e `/api/webhooks/hotmart` (eventos de compra) — passam por um pipeline único
(`lib/dispatch-event.ts`) que formata cada evento no schema recomendado por
plataforma, deduplica, dispara para Meta CAPI + GA4, e grava tudo no Supabase
(que serve de CRM e alimenta dashboards).

```
Site → /api/collect ─────────────┐
                                   ├─→ dispatchEvent() → dedup → Meta CAPI
Hotmart → /api/webhooks/hotmart ─┘                    └────────→ GA4 MP
                                                        └────────→ Supabase (events, leads, purchases)
```

## 1. Configurar o Supabase

1. Crie um projeto em supabase.com.
2. Vá em **SQL Editor** e rode o conteúdo de `supabase/schema.sql`.
3. Em **Project Settings > API**, copie `Project URL` e a `service_role key`
   (não a `anon key` — a service_role fica só no servidor).

## 2. Configurar o Meta

1. Events Manager > seu Pixel > **Configurações** > Conversions API > gerar token.
2. Copie o `Pixel ID` e o `Access Token`.
3. Para testar sem sujar dados reais, pegue o código em **Test Events** e
   defina `META_TEST_EVENT_CODE` nas variáveis de ambiente — ele é enviado
   automaticamente em todo evento enquanto essa variável existir. Remova-a
   em produção.

## 3. Configurar o GA4

1. Admin > Fluxos de dados > seu fluxo da web > **Measurement Protocol API secrets** > criar.
2. Copie o `Measurement ID` (formato `G-XXXXXXX`) e o `API secret`.

## 4. Catálogo de eventos (`lib/event-catalog.ts`)

Todo evento — venha do site ou da Hotmart — é traduzido para um nome
canônico interno, e daqui sai o nome/formato que cada plataforma espera:

| Canônico | Origem | Meta (nome) | Meta padrão? | GA4 (nome) | Vai pro Meta? |
|---|---|---|---|---|---|
| `PageView` | site | `PageView` | sim | `page_view` | sim |
| `Lead` | site | `Lead` | sim | `generate_lead` | sim |
| `InitiateCheckout` | site | `InitiateCheckout` | sim | `begin_checkout` | sim |
| `AddPaymentInfo` | Hotmart `PURCHASE_BILLET_PRINTED` | `AddPaymentInfo` | sim | `add_payment_info` | sim |
| `Purchase` | Hotmart `PURCHASE_APPROVED`/`PURCHASE_COMPLETE` | `Purchase` | sim | `purchase` | sim |
| `AbandonedCheckout` | Hotmart `PURCHASE_OUT_OF_SHOPPING_CART` | `AbandonedCheckout` | custom | `abandoned_checkout` | sim |
| `Refund` | Hotmart `PURCHASE_REFUNDED` | `Refund` | custom | `refund` | sim |
| `Chargeback` | Hotmart `PURCHASE_CHARGEBACK` | `Chargeback` | custom | `chargeback` | sim |
| `PurchaseProtest` | Hotmart `PURCHASE_PROTEST` | — | — | `purchase_protest` | não |
| `PurchaseCanceled` | Hotmart `PURCHASE_CANCELED` | `PurchaseCanceled` | custom | `purchase_canceled` | sim |
| `PurchaseExpired` | Hotmart `PURCHASE_EXPIRED` | — | — | `purchase_expired` | não |
| `PurchaseDelayed` | Hotmart `PURCHASE_DELAYED` | — | — | `purchase_delayed` | não |
| `SubscriptionCancellation` | Hotmart `SUBSCRIPTION_CANCELLATION` | `SubscriptionCancellation` | custom | `subscription_cancellation` | sim |
| `ClubFirstAccess` | Hotmart `CLUB_FIRST_ACCESS` | — | — | `club_first_access` | não |
| `ClubModuleCompleted` | Hotmart `CLUB_MODULE_COMPLETED` | — | — | `club_module_completed` | não |

Os eventos "não vai pro Meta" ainda ficam auditados no Supabase e vão pro
GA4 (que aceita qualquer custom event sem poluir otimização de campanha).
Pra Meta, evitamos mandar sinais que não ajudam a otimizar entrega — mas
`sendToMeta` é só um boolean em `event-catalog.ts`, mude à vontade.

**Formatação por plataforma:**
- **Meta** (`lib/format-meta.ts` + `lib/pii-normalize.ts`): email sem espaços
  (nenhum, não só das pontas) + minúsculas; telefone só com dígitos, código
  do país e **sem zeros à esquerda** (nunca com "+"); nome em minúsculas
  **sem pontuação, mas mantendo acentos** (o próprio exemplo da Meta
  normaliza "Valéry" pra "valéry", não pra "valery"); `ct`/`st`/`zp`/`country`
  hasheados sempre que disponíveis (a Meta recomenda mandar mesmo que todo
  o público seja do mesmo país). `custom_data` com
  `currency`+`value`+`content_ids`+`content_type`+`order_id` nos eventos de
  comércio — o formato que o Events Manager espera pra casar com o Catalog.
  Fonte: [Parâmetros de informações do cliente](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters).
- **GA4** (`lib/format-ga4.ts` + `lib/pii-normalize.ts`): `transaction_id`+
  `value`+`currency`+`items[]` no formato de ecommerce recomendado. Além
  disso, quando há email/telefone/nome/endereço, envia `user_data`: email em
  minúsculas sem espaços e sem pontos antes de `@gmail.com`/`@googlemail.com`;
  telefone em **E.164 com "+"**; e um bloco `address` com nome/sobrenome/rua
  hasheados (removendo dígitos e símbolos, diferente da Meta) e
  cidade/região/CEP/país **em texto puro, sem hash** — só nome, sobrenome e
  rua são SHA-256 nesse bloco. O `user_id` (obrigatório junto com
  `user_data`) usa o UUID do lead no Supabase — nunca a própria PII. Fonte:
  [Enviar dados fornecidos pelo usuário com o User-ID](https://developers.google.com/analytics/devguides/collection/ga4/uid-data?hl=pt-br).

⚠️ **Meta e GA4 exigem normalizações diferentes do mesmo telefone** (Meta:
dígitos sem "+"; GA4: E.164 com "+"). É por isso que `lib/pii-normalize.ts`
tem uma função pra cada plataforma em vez de uma só — usar a normalização
errada faz o hash não bater com o que a plataforma espera, e o evento não
casa com o usuário. Por padrão assume Brasil (código `55`); ajuste
`DEFAULT_PHONE_COUNTRY_CODE` se seu público não for majoritariamente BR.

## 5. Deduplicação (duas camadas)

1. **Retries do seu próprio webhook**: a Hotmart reenvia a notificação até
   5x se não receber 200 rápido. `dispatchEvent()` gera um `event_id`
   determinístico (`hotmart_{transaction}_{evento}`) e confere na tabela
   `events` (coluna `event_id` é `UNIQUE`) antes de disparar — reenvio não
   duplica Purchase no Meta nem no GA4.
2. **Pixel do navegador vs. servidor**: se você também mantiver o Pixel da
   Meta rodando no browser (recomendado pra eventos rápidos como PageView),
   dispare com o mesmo `event_id` nos dois lados — a Meta deduplica
   automaticamente pelo par `event_id` + `event_name`.

## 6. Configurar a Hotmart

1. **Webhook**: Ferramentas > Webhook (API e notificações) > + Cadastrar
   Webhook > versão **2.0.0** > marque todos os eventos de compra que
   quiser (aprovada, cancelada, reembolsada, chargeback, boleto impresso,
   carrinho abandonado, assinatura cancelada) > URL:
   `https://seudominio.com/api/webhooks/hotmart`.
2. **Hottok**: copie o token na aba Autenticação da mesma configuração e
   coloque em `HOTMART_HOTTOK` — o endpoint rejeita qualquer chamada sem
   esse token batendo.
3. **Rastreio de origem (fbp/fbc/UTMs até a compra)**: a Hotmart não manda
   cookies do seu site no webhook, então é preciso correlacionar via um
   código de rastreio. Troque o link "Comprar" do site de
   `https://pay.hotmart.com/XXXXXXXX` para
   `https://seudominio.com/api/checkout-redirect?url=https://pay.hotmart.com/XXXXXXXX`.
   Esse endpoint grava o contexto (fbp, fbc, ga_client_id, UTMs, IP, User-Agent)
   com um código único, anexa esse código como `?sck=` no link da Hotmart, e
   redireciona. Quando o webhook da compra chega, o mesmo código volta no
   payload e o contexto é recuperado — é o que faz o `Purchase` reportado
   pra Meta ter `action_source: "website"` com bom match rate, em vez de
   cair como conversão "às cegas".

   ⚠️ **Importante**: confirme o campo exato onde a Hotmart devolve esse
   código testando com Ferramentas > Webhook > sua config > **Enviar teste**
   — o path pode variar por tipo de evento/versão. `lib/hotmart.ts` já tenta
   os caminhos mais comuns (`data.purchase.origin.sck`, `.xcod`, etc.);
   ajuste `extractTrackingCode()` se o payload real vier diferente. O
   payload cru sempre fica salvo em `events.raw_payload` pra comparar.

## 7. Deploy na Vercel

```bash
npm install
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add META_PIXEL_ID
vercel env add META_ACCESS_TOKEN
vercel env add GA4_MEASUREMENT_ID
vercel env add GA4_API_SECRET
vercel env add HOTMART_HOTTOK
vercel deploy --prod
```

Isso publica `/api/collect`, `/api/webhooks/hotmart`, `/api/checkout-redirect`
e `/track.js` no seu próprio domínio (ex. `jeancarlosnovaes.com/api/collect`)
— first-party, sem depender de servidor de terceiro.

## 8. Instalar o script no site

Adicione antes do `</body>`:

```html
<script src="/track.js"></script>
```

Isso já dispara um `PageView` automático. Para eventos de conversão do site
(os nomes precisam bater com os canônicos da tabela da seção 4), chame em
qualquer lugar:

```html
<script>
  document.getElementById('form-lead').addEventListener('submit', function () {
    trackEvent('Lead', {
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      product: 'Simplificando a Matemática',
    });
  });
</script>
```

```html
<script>
  // No botão "Comprar", antes de trocar o href pro checkout-redirect
  trackEvent('InitiateCheckout', {
    product: 'Simplificando a Matemática',
    value: 197.0,
    currency: 'BRL',
  });
</script>
```

`Purchase`, `AddPaymentInfo`, `Refund` etc. **não precisam ser disparados
pelo site** — chegam automaticamente via `/api/webhooks/hotmart` assim que a
Hotmart notifica.

## 9. Verificar se está funcionando

- **Meta**: Events Manager > Test Events (com `META_TEST_EVENT_CODE` ativo)
  ou aba "Eventos recebidos" — deve aparecer `Server` na origem, não `Browser`.
- **GA4**: troque temporariamente a URL em `lib/ga4.ts` para
  `.../debug/mp/collect` — ela retorna os erros de validação do payload.
- **Hotmart**: Ferramentas > Webhook > sua config > histórico de posts —
  mostra o status HTTP que seu endpoint respondeu e o payload enviado.
- **Supabase**: consulte a tabela `events` — cada linha mostra o status do
  disparo para Meta e GA4 (`meta_status`, `ga4_status`, `meta_response`).

## 10. CRM

Duas tabelas cobrem isso:
- `leads`: um registro por email, atualizado a cada evento, com UTMs,
  `fbclid`/`gclid`, produto de interesse.
- `purchases`: uma linha por transação da Hotmart, sempre com o status mais
  recente (aprovada, reembolsada, chargeback, cancelada...).

Para uma interface visual sem escrever SQL, conecte o mesmo Postgres do
Supabase a um **NocoDB** ou **Baserow** self-hosted.

## 11. Dashboards

Suba um **Metabase** (Docker) apontando para a connection string do Postgres
do Supabase (Project Settings > Database). Dá pra montar funil (PageView →
Lead → InitiateCheckout → AddPaymentInfo → Purchase), receita líquida
(`purchases` menos `Refund`/`Chargeback`), origem por UTM/campanha e taxa de
conversão por produto — tudo com os dados que você mesmo gravou.
