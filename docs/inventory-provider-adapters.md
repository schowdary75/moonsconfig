# Inventory provider adapters

MooNsConfig treats live inventory as an external trust boundary. A provider response is usable only
after the provider is configured, the request succeeds before its deadline, and every returned
offer passes runtime validation. No adapter may invent availability, prices, rooms, or supplier
references.

## Contract

`HotelQuery` is the normalized request passed to every hotel adapter:

| Field         | Meaning                                         |
| ------------- | ----------------------------------------------- |
| `destination` | Non-empty destination text; trim before sending |
| `checkIn`     | Valid arrival date                              |
| `checkOut`    | Valid departure date later than `checkIn`       |
| `guests`      | Positive whole-number occupancy                 |

`HotelOffer` is the only hotel shape returned to Maya. It requires supplier, property, room, board,
price in INR, and cancellation-policy fields. An adapter must map its provider-specific response to
this shape; it must not fill missing fields with guesses.

`InventoryResult<HotelOffer>` has three fields:

- `available: true` means a configured live provider returned a successfully validated response.
  `offers` may still be empty when the provider genuinely returned no matching rooms.
- `available: false` means live inventory is unavailable or untrustworthy. This does **not** mean
  that the provider confirmed zero rooms. Callers must use the real package-catalogue fallback.
- `provider` identifies the adapter that answered. Unconfigured calls use `fallback`.

## Runtime configuration

The built-in HTTP boundary reads these server-only variables:

```dotenv
INVENTORY_PROVIDER=
INVENTORY_API_BASE_URL=
INVENTORY_API_KEY=
INVENTORY_TIMEOUT_MS=20000
```

Leave all provider fields blank until an adapter has been reviewed. `INVENTORY_API_BASE_URL` must be
an HTTPS provider endpoint in production. The timeout accepts 100–60,000 milliseconds and defaults
to 20 seconds. Never put an inventory credential in a `VITE_*` variable, a URL, a fixture, a log, or
client code.

The configurable adapter sends the key only as an `Authorization: Bearer …` header. If a provider
uses a different authentication scheme, implement that inside its adapter and keep the value in a
server secret. Do not add credentials to query strings.

## Adapter boundary

Current callers continue to use the singleton:

```ts
import { inventoryProvider } from '../maya/inventory/inventoryProvider.js';
```

Tests and provider-specific factories can inject configuration, a fetch-compatible transport, and a
warning logger:

```ts
const provider = createInventoryProvider({
  config,
  transport: localStub,
  warningLogger: testLogger,
});
```

`server/src/maya/inventory/exampleInventoryProvider.ts` is a credential-free mapping example. It is
not imported by the runtime singleton, uses the reserved `example-only` ID, watermarks fixture
suppliers with `EXAMPLE-NOT-BOOKABLE`, and throws if constructed in production. Copy its mapping
pattern into a separately reviewed provider module; do not register the example itself.

## Request and response example

This redacted request illustrates the normalized boundary. It is not sent by the test suite:

```http
POST https://inventory.example.invalid/hotels/search
Authorization: [REDACTED]
Content-Type: application/json

{
  "destination": "Test City",
  "checkIn": "2030-01-10",
  "checkOut": "2030-01-12",
  "guests": 2
}
```

A validated but explicitly non-bookable fixture result looks like:

```json
{
  "available": true,
  "provider": "example-only",
  "offers": [
    {
      "supplier": "EXAMPLE-NOT-BOOKABLE:fixture",
      "hotelName": "Example Property",
      "roomType": "Example Room",
      "boardBasis": "Example Board",
      "totalPriceInr": 100,
      "cancellationPolicy": "Example only."
    }
  ]
}
```

Nothing in that result represents real availability or a bookable rate.

## Failure and fallback rules

The adapter returns `available: false` with no offers when it is unconfigured, the query is invalid,
the provider returns non-2xx, the deadline aborts, the network fails, JSON parsing fails, or the
payload does not match the complete offer schema. Callers then use the verified catalogue; they
must never create replacement live offers.

Warnings include only the provider ID and a small reason or HTTP status. Do not log request bodies,
destinations, headers, response bodies, error objects, traveller data, or supplier credentials.
The shared logger also redacts sensitive field names, but adapters must minimize logged data before
it reaches that layer.

## Adding a provider

1. Implement `LiveInventoryProvider` in a provider-specific module.
2. Inject the transport so tests never contact the provider.
3. Map every response field and validate the provider payload before returning `available: true`.
4. Apply an abort deadline and safe fallback for every error path.
5. Add deterministic success, non-2xx, timeout, network, malformed-response, and unconfigured tests.
6. Document provider-specific environment names with blank or clearly invalid placeholders.
7. Register the provider only after security and contract review.
